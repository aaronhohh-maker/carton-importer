// Deno Supabase Edge Function — process-import
// Triggered with: { importId: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface PricingTier {
  min_qty: number
  price: number
}

interface SizeTier {
  id: string
  category_id: string
  size_label: string
  pricing_tiers: PricingTier[]
}

interface Category {
  id: string
  name: string
  shopify_collection_id: string | null
  shopify_tag: string | null
  noissue_url_path: string | null
  size_tiers?: SizeTier[]
}

interface VariantPricing {
  sizeLabel: string
  pricingTiers: PricingTier[]
  matched: boolean
}

interface ScrapedProduct {
  title: string
  description: string
  variants: Array<{ sizeLabel: string }>
  imageUrls: string[]
}

interface ProcessedContent {
  description: string
  seoTitle: string
  seoDescription: string
  imageAltTexts: string[]
}

interface TransferResult {
  originalUrl: string
  shopifyUrl: string | null
  altText: string
}

// Inline detectCategory (mirrors src/modules/template-manager/index.ts)
function detectCategory(url: string, categories: Category[]): Category | null {
  for (const category of categories) {
    if (category.noissue_url_path && url.includes(category.noissue_url_path)) {
      return category
    }
  }
  return null
}

// Inline mapPricing (mirrors src/modules/pricing-mapper/index.ts)
function mapPricing(sizeLabels: string[], sizeTiers: SizeTier[]): VariantPricing[] {
  return sizeLabels.map((sizeLabel) => {
    const match = sizeTiers.find(
      (tier) => tier.size_label.toLowerCase() === sizeLabel.toLowerCase()
    )
    if (match) {
      return { sizeLabel, pricingTiers: match.pricing_tiers, matched: true }
    }
    return { sizeLabel, pricingTiers: [], matched: false }
  })
}

async function shopifyFetch(path: string, body: unknown): Promise<Response> {
  const domain = Deno.env.get('SHOPIFY_STORE_DOMAIN')
  const token = Deno.env.get('SHOPIFY_ADMIN_API_TOKEN')
  if (!domain || !token) throw new Error('Missing Shopify env vars')

  const url = `https://${domain}/admin/api/2024-01${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Shopify ${res.status} for ${path}: ${text}`)
  }

  return res
}

async function createDraftProduct(params: {
  title: string
  description: string
  seoTitle: string
  seoDescription: string
  shopifyCollectionId: string | null
  shopifyTag: string | null
  variants: VariantPricing[]
  shopifyImageUrls: string[]
}): Promise<string> {
  const { title, description, seoTitle, seoDescription, shopifyCollectionId, shopifyTag, variants, shopifyImageUrls } = params

  const shopifyVariants = variants.map((v) => ({
    title: v.sizeLabel,
    price: v.pricingTiers.length > 0 ? v.pricingTiers[0].price.toFixed(2) : '0.00',
  }))

  const productRes = await shopifyFetch('/products.json', {
    product: {
      title,
      body_html: description,
      status: 'draft',
      tags: shopifyTag ?? undefined,
      variants: shopifyVariants.length > 0 ? shopifyVariants : [{ title: 'Default', price: '0.00' }],
      images: shopifyImageUrls.map((src) => ({ src })),
      metafields: [
        {
          namespace: 'global',
          key: 'title_tag',
          value: seoTitle,
          type: 'single_line_text_field',
        },
        {
          namespace: 'global',
          key: 'description_tag',
          value: seoDescription,
          type: 'single_line_text_field',
        },
      ],
    },
  })

  const productData = await productRes.json()
  const product = productData.product as { id: number; variants: Array<{ id: number; title: string }> }

  // Set metafields on variants
  await Promise.all(
    product.variants.map(async (sv, idx) => {
      const vp = variants[idx]
      if (!vp) return
      await shopifyFetch(
        `/products/${product.id}/variants/${sv.id}/metafields.json`,
        {
          metafield: {
            namespace: 'custom',
            key: 'pricing_tiers',
            value: JSON.stringify(vp.pricingTiers),
            type: 'json',
          },
        }
      )
    })
  )

  if (shopifyCollectionId) {
    await shopifyFetch('/collects.json', {
      collect: { product_id: product.id, collection_id: shopifyCollectionId },
    })
  }

  return String(product.id)
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? ''

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  let importId: string
  try {
    const body = await req.json()
    importId = body.importId
    if (!importId) throw new Error('importId is required')
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 })
  }

  try {
    // 1. Load import record, set status → 'scraping'
    const { data: importRecord, error: importError } = await supabase
      .from('imports')
      .select('*')
      .eq('id', importId)
      .single()

    if (importError || !importRecord) {
      throw new Error(`Import not found: ${importError?.message ?? importId}`)
    }

    await supabase
      .from('imports')
      .update({ status: 'scraping', updated_at: new Date().toISOString() })
      .eq('id', importId)

    // 2. Load categories + size_tiers
    const { data: categoriesData, error: catError } = await supabase
      .from('categories')
      .select('*, size_tiers(*)')

    if (catError) throw new Error(`Failed to load categories: ${catError.message}`)
    const categories: Category[] = categoriesData ?? []

    // 3. Scrape via API route
    const scrapeRes = await fetch(`${appUrl}/api/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: importRecord.url }),
    })

    if (!scrapeRes.ok) {
      const errData = await scrapeRes.json()
      throw new Error(`Scrape failed: ${errData.error ?? scrapeRes.status}`)
    }

    const scraped: ScrapedProduct = await scrapeRes.json()

    // 4. Status → 'processing'
    await supabase
      .from('imports')
      .update({ status: 'processing', source_data: scraped, updated_at: new Date().toISOString() })
      .eq('id', importId)

    // 5. Detect category from URL
    let category: Category | null = null
    if (importRecord.category_id) {
      category = categories.find((c) => c.id === importRecord.category_id) ?? null
    }
    if (!category) {
      category = detectCategory(importRecord.url, categories)
    }

    // 6. AI content processing — rewrite description, generate SEO fields and alt texts
    let aiProcessed: ProcessedContent | null = null
    try {
      const aiRes = await fetch(`${appUrl}/api/ai-process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw: {
            title: scraped.title,
            description: scraped.description,
            imageUrls: scraped.imageUrls,
            categoryName: category?.name ?? '',
          },
        }),
      })

      if (aiRes.ok) {
        aiProcessed = await aiRes.json() as ProcessedContent
      } else {
        const errData = await aiRes.text()
        console.warn(`[process-import] AI processing failed (continuing with raw content): ${aiRes.status} ${errData}`)
      }
    } catch (aiErr) {
      console.warn(`[process-import] AI processing error (continuing with raw content): ${String(aiErr)}`)
    }

    // Use AI-enriched content when available, fall back to scraped raw content
    const finalDescription = aiProcessed?.description ?? scraped.description
    const seoTitle = aiProcessed?.seoTitle ?? scraped.title.slice(0, 60)
    const seoDescription = aiProcessed?.seoDescription ?? scraped.description.slice(0, 160)

    // 7. Map pricing
    const sizeTiers: SizeTier[] = category?.size_tiers ?? []
    const sizeLabels = scraped.variants.map((v) => v.sizeLabel)
    const variantPricing = mapPricing(sizeLabels, sizeTiers)

    // 8. Transfer images to Shopify Files API
    let transferResults: TransferResult[] = []
    if (scraped.imageUrls.length > 0 && appUrl) {
      try {
        const altTexts = scraped.imageUrls.map(() => scraped.title)
        const transferRes = await fetch(`${appUrl}/api/transfer-images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrls: scraped.imageUrls, altTexts }),
        })
        if (transferRes.ok) {
          transferResults = await transferRes.json()
        } else {
          const errData = await transferRes.text()
          console.error(`[process-import] Image transfer failed: ${transferRes.status} ${errData}`)
        }
      } catch (err) {
        console.error(`[process-import] Image transfer error: ${String(err)}`)
      }
    }
    const shopifyImageUrls = transferResults
      .filter((r) => r.shopifyUrl !== null)
      .map((r) => r.shopifyUrl as string)

    // 9. Create Shopify draft product using AI-enriched content
    const shopifyProductId = await createDraftProduct({
      title: scraped.title,
      description: finalDescription,
      seoTitle,
      seoDescription,
      shopifyCollectionId: category?.shopify_collection_id ?? null,
      shopifyTag: category?.shopify_tag ?? null,
      variants: variantPricing,
      shopifyImageUrls,
    })

    const processedData = {
      title: scraped.title,
      description: finalDescription,
      seoTitle,
      seoDescription,
      variants: variantPricing,
      imageUrls: scraped.imageUrls,
      imageAltTexts: aiProcessed?.imageAltTexts ?? scraped.imageUrls.map(() => scraped.title),
      transferredImages: transferResults,
      aiEnriched: aiProcessed !== null,
    }

    // 10. Update import: status → 'draft'
    await supabase
      .from('imports')
      .update({
        status: 'draft',
        shopify_product_id: shopifyProductId,
        category_id: category?.id ?? importRecord.category_id,
        processed_data: processedData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', importId)

    // 11. Write activity_log entry with field-level diff (initial import: old = null)
    const changedFields: Record<string, { old: unknown; new: unknown }> = {
      title: { old: null, new: processedData.title },
      description: { old: null, new: processedData.description },
      variants_count: { old: null, new: processedData.variants.length },
      image_count: { old: null, new: processedData.imageUrls.length },
    }

    await supabase.from('activity_log').insert({
      import_id: importId,
      action: 'imported',
      changed_fields: changedFields,
      triggered_by: importRecord.created_by ?? null,
    })

    return new Response(
      JSON.stringify({ success: true, shopifyProductId }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    await supabase
      .from('imports')
      .update({
        status: 'failed',
        processed_data: { error: message },
        updated_at: new Date().toISOString(),
      })
      .eq('id', importId)

    // Fire failure alert (fire-and-forget — don't let notification errors mask the real error)
    if (appUrl) {
      fetch(`${appUrl}/api/notify-import-failure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importId, error: message }),
      }).catch((notifyErr) => {
        console.error(`[process-import] Failed to send failure notification: ${String(notifyErr)}`)
      })
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
