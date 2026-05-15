import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { logActivity } from '@/modules/activity-logger'
import type { ResyncField, ProcessedProduct, ProcessedVariant, ProcessedImage } from '@/types'

// ─── helpers ────────────────────────────────────────────────────────────────

const SHOPIFY_API_VERSION = '2024-01'

async function shopifyFetch(path: string, options: RequestInit): Promise<Response> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN
  if (!domain || !token) throw new Error('Shopify env vars not configured')
  const res = await fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Shopify API ${res.status} for ${path}: ${body}`)
  }
  return res
}

interface ImportRecord {
  id: string
  url: string
  shopify_product_id: string | null
  processed_data: ProcessedProduct | null
  category_id: string | null
  categories: { name: string } | null
}

async function loadImport(id: string): Promise<ImportRecord | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('imports')
    .select('id, url, shopify_product_id, processed_data, category_id, categories(name)')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data as ImportRecord
}

async function scrapeAndProcess(
  url: string,
  categoryName: string,
  baseUrl: string
): Promise<ProcessedProduct> {
  // 1. Scrape
  const scrapeRes = await fetch(`${baseUrl}/api/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!scrapeRes.ok) {
    const d = await scrapeRes.json().catch(() => ({}))
    throw new Error((d as { error?: string }).error ?? `Scrape failed: HTTP ${scrapeRes.status}`)
  }
  const scraped = await scrapeRes.json()

  // 2. AI-process
  const aiRes = await fetch(`${baseUrl}/api/ai-process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      raw: {
        title: scraped.title,
        description: scraped.description,
        imageUrls: scraped.imageUrls,
        categoryName,
      },
    }),
  })
  if (!aiRes.ok) {
    const d = await aiRes.json().catch(() => ({}))
    throw new Error((d as { error?: string }).error ?? `AI process failed: HTTP ${aiRes.status}`)
  }
  const processed = await aiRes.json()

  // Assemble ProcessedProduct
  const result: ProcessedProduct = {
    title: scraped.title,
    description: processed.description,
    seoTitle: processed.seoTitle,
    seoDescription: processed.seoDescription,
    variants: (scraped.variants as Array<{ sizeLabel: string }>).map(
      (v): ProcessedVariant => ({
        sizeLabel: v.sizeLabel,
        pricingTiers: [],
      })
    ),
    images: (scraped.imageUrls as string[]).map(
      (url: string, i: number): ProcessedImage => ({
        originalUrl: url,
        altText: (processed.imageAltTexts as string[])[i] ?? `${scraped.title} product image`,
      })
    ),
  }

  return result
}

type DiffEntry = { old: unknown; new: unknown; changed: boolean }
type DiffResult = Record<string, DiffEntry>

function computeDiff(
  oldData: ProcessedProduct | null,
  newData: ProcessedProduct
): DiffResult {
  const stringify = (v: unknown) =>
    typeof v === 'string' ? v : JSON.stringify(v)

  const fields: Array<{ key: string; oldVal: unknown; newVal: unknown }> = [
    { key: 'title', oldVal: oldData?.title ?? null, newVal: newData.title },
    { key: 'description', oldVal: oldData?.description ?? null, newVal: newData.description },
    { key: 'seoTitle', oldVal: oldData?.seoTitle ?? null, newVal: newData.seoTitle },
    { key: 'seoDescription', oldVal: oldData?.seoDescription ?? null, newVal: newData.seoDescription },
    {
      key: 'variants',
      oldVal: oldData?.variants ?? null,
      newVal: newData.variants,
    },
    {
      key: 'imageUrls',
      oldVal: oldData?.images?.map((i) => i.originalUrl) ?? null,
      newVal: newData.images.map((i) => i.originalUrl),
    },
  ]

  const diff: DiffResult = {}
  for (const { key, oldVal, newVal } of fields) {
    diff[key] = {
      old: oldVal,
      new: newVal,
      changed: stringify(oldVal) !== stringify(newVal),
    }
  }
  return diff
}

// ─── GET — compute diff ──────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const importRecord = await loadImport(id)
  if (!importRecord) {
    return NextResponse.json({ error: 'Import not found' }, { status: 404 })
  }

  const categoryName = importRecord.categories?.name ?? 'packaging'
  const baseUrl = new URL(req.url).origin

  try {
    const freshData = await scrapeAndProcess(importRecord.url, categoryName, baseUrl)
    const diff = computeDiff(importRecord.processed_data, freshData)
    return NextResponse.json({ diff })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─── POST — apply selected fields ───────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const importRecord = await loadImport(id)
  if (!importRecord) {
    return NextResponse.json({ error: 'Import not found' }, { status: 404 })
  }

  let body: { fields?: ResyncField[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const selectedFields: ResyncField[] = body.fields ?? []
  if (selectedFields.length === 0) {
    return NextResponse.json({ error: 'No fields selected' }, { status: 400 })
  }

  const categoryName = importRecord.categories?.name ?? 'packaging'
  const baseUrl = new URL(req.url).origin

  // 1. Re-run scrape + AI
  let freshData: ProcessedProduct
  try {
    freshData = await scrapeAndProcess(importRecord.url, categoryName, baseUrl)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const oldData = importRecord.processed_data

  // 2. Build updated processed_data by merging selected fields
  const updatedProcessedData: ProcessedProduct = {
    title: selectedFields.includes('title') ? freshData.title : (oldData?.title ?? freshData.title),
    description: selectedFields.includes('description')
      ? freshData.description
      : (oldData?.description ?? freshData.description),
    seoTitle: selectedFields.includes('seo')
      ? freshData.seoTitle
      : (oldData?.seoTitle ?? freshData.seoTitle),
    seoDescription: selectedFields.includes('seo')
      ? freshData.seoDescription
      : (oldData?.seoDescription ?? freshData.seoDescription),
    variants: selectedFields.includes('variants')
      ? freshData.variants
      : (oldData?.variants ?? freshData.variants),
    images: selectedFields.includes('images')
      ? freshData.images
      : (oldData?.images ?? freshData.images),
  }

  // 3. Persist updated processed_data to Supabase
  const supabase = createServiceClient()
  const { error: updateError } = await supabase
    .from('imports')
    .update({
      processed_data: updatedProcessedData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to update import: ${updateError.message}` },
      { status: 500 }
    )
  }

  // 4. Push selected fields to Shopify
  const shopifyErrors: string[] = []

  if (importRecord.shopify_product_id) {
    const pid = importRecord.shopify_product_id

    // title / description → product PUT
    if (selectedFields.includes('title') || selectedFields.includes('description')) {
      try {
        await shopifyFetch(`/products/${pid}.json`, {
          method: 'PUT',
          body: JSON.stringify({
            product: {
              ...(selectedFields.includes('title') && { title: freshData.title }),
              ...(selectedFields.includes('description') && {
                body_html: freshData.description,
              }),
            },
          }),
        })
      } catch (err) {
        shopifyErrors.push(`product update: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // seo → metafields global.title_tag + global.description_tag
    if (selectedFields.includes('seo')) {
      const metafieldUpdates = [
        { namespace: 'global', key: 'title_tag', value: freshData.seoTitle, type: 'single_line_text_field' },
        { namespace: 'global', key: 'description_tag', value: freshData.seoDescription, type: 'single_line_text_field' },
      ]
      for (const mf of metafieldUpdates) {
        try {
          await shopifyFetch(`/products/${pid}/metafields.json`, {
            method: 'POST',
            body: JSON.stringify({ metafield: mf }),
          })
        } catch (err) {
          shopifyErrors.push(`seo metafield (${mf.key}): ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    // variants → update custom.pricing_tiers metafield
    if (selectedFields.includes('variants') && freshData.variants.length > 0) {
      try {
        // Fetch existing Shopify variants to get their IDs
        const variantsRes = await shopifyFetch(`/products/${pid}/variants.json`, {
          method: 'GET',
        })
        const variantsData = (await variantsRes.json()) as {
          variants: Array<{ id: number; title: string }>
        }
        const shopifyVariants = variantsData.variants

        await Promise.all(
          freshData.variants.map(async (v, idx) => {
            const shopifyVariant = shopifyVariants[idx]
            if (!shopifyVariant) return
            try {
              await shopifyFetch(
                `/products/${pid}/variants/${shopifyVariant.id}/metafields.json`,
                {
                  method: 'POST',
                  body: JSON.stringify({
                    metafield: {
                      namespace: 'custom',
                      key: 'pricing_tiers',
                      value: JSON.stringify(v.pricingTiers),
                      type: 'json',
                    },
                  }),
                }
              )
            } catch (err) {
              shopifyErrors.push(
                `variant ${v.sizeLabel} metafield: ${err instanceof Error ? err.message : String(err)}`
              )
            }
          })
        )
      } catch (err) {
        shopifyErrors.push(`variant fetch: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // images → transfer new images and attach to product
    if (selectedFields.includes('images') && freshData.images.length > 0) {
      try {
        const transferRes = await fetch(`${baseUrl}/api/transfer-images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrls: freshData.images.map((i) => i.originalUrl),
            altTexts: freshData.images.map((i) => i.altText),
          }),
        })
        if (transferRes.ok) {
          const transferred = (await transferRes.json()) as Array<{
            originalUrl: string
            shopifyUrl: string | null
            altText: string
          }>

          // Attach each transferred image to the Shopify product
          for (const img of transferred) {
            if (!img.shopifyUrl) continue
            try {
              await shopifyFetch(`/products/${pid}/images.json`, {
                method: 'POST',
                body: JSON.stringify({
                  image: {
                    src: img.shopifyUrl,
                    alt: img.altText,
                  },
                }),
              })
            } catch (err) {
              shopifyErrors.push(
                `attach image: ${err instanceof Error ? err.message : String(err)}`
              )
            }
          }
        } else {
          const d = await transferRes.json().catch(() => ({}))
          shopifyErrors.push(
            `image transfer: ${(d as { error?: string }).error ?? `HTTP ${transferRes.status}`}`
          )
        }
      } catch (err) {
        shopifyErrors.push(`images: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  // 5. Save resync_selections record
  await supabase.from('resync_selections').insert({
    import_id: id,
    fields_selected: selectedFields,
    triggered_at: new Date().toISOString(),
  })

  // 6. Build changedFields for activity log — only fields that actually changed
  const changedFields: Record<string, { old: unknown; new: unknown }> = {}

  if (selectedFields.includes('title') && oldData?.title !== freshData.title) {
    changedFields.title = { old: oldData?.title ?? null, new: freshData.title }
  }
  if (selectedFields.includes('description') && oldData?.description !== freshData.description) {
    changedFields.description = { old: oldData?.description ?? null, new: freshData.description }
  }
  if (
    selectedFields.includes('seo') &&
    (oldData?.seoTitle !== freshData.seoTitle || oldData?.seoDescription !== freshData.seoDescription)
  ) {
    changedFields.seoTitle = { old: oldData?.seoTitle ?? null, new: freshData.seoTitle }
    changedFields.seoDescription = {
      old: oldData?.seoDescription ?? null,
      new: freshData.seoDescription,
    }
  }
  if (
    selectedFields.includes('variants') &&
    JSON.stringify(oldData?.variants) !== JSON.stringify(freshData.variants)
  ) {
    changedFields.variants = { old: oldData?.variants ?? null, new: freshData.variants }
  }
  if (
    selectedFields.includes('images') &&
    JSON.stringify(oldData?.images?.map((i) => i.originalUrl)) !==
      JSON.stringify(freshData.images.map((i) => i.originalUrl))
  ) {
    changedFields.images = {
      old: oldData?.images?.map((i) => i.originalUrl) ?? null,
      new: freshData.images.map((i) => i.originalUrl),
    }
  }

  await logActivity({
    importId: id,
    action: 'resynced',
    changedFields,
  })

  const updatedImport = {
    processed_data: updatedProcessedData,
  }

  return NextResponse.json({
    success: true,
    updatedFields: selectedFields,
    ...(shopifyErrors.length > 0 && { shopifyWarnings: shopifyErrors }),
    updatedImport,
  })
}
