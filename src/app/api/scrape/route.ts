import { NextRequest, NextResponse } from 'next/server'
import { parse } from 'node-html-parser'
import type { ScrapedProduct } from '@/types'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    return await handleScrape(req)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Scrape failed: ${message}` }, { status: 500 })
  }
}

async function handleScrape(req: NextRequest): Promise<NextResponse> {
  let body: { url?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { url } = body

  if (!url || !url.includes('noissue.co')) {
    return NextResponse.json(
      { error: 'URL must be a noissue.co product URL' },
      { status: 400 }
    )
  }

  const apiKey = process.env.BROWSERLESS_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'BROWSERLESS_API_KEY environment variable is not set' },
      { status: 500 }
    )
  }

  // Use Browserless REST API — no native browser binaries needed
  const contentRes = await fetch(
    `https://chrome.browserless.io/content?token=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, waitFor: 'networkidle2' }),
    }
  )

  if (!contentRes.ok) {
    const text = await contentRes.text()
    throw new Error(`Browserless /content returned ${contentRes.status}: ${text.slice(0, 200)}`)
  }

  const html = await contentRes.text()
  const root = parse(html)

  // --- Title ---
  const title = root.querySelector('h1')?.text.trim() ?? ''

  // --- Description ---
  let description = ''
  const descSelectors = [
    '[data-testid="product-description"]',
    '.product-description',
    '.product__description',
  ]
  for (const sel of descSelectors) {
    const el = root.querySelector(sel)
    if (el) {
      description = el.text.trim()
      break
    }
  }
  // Fallback: any element whose class contains "description"
  if (!description) {
    const el = root.querySelectorAll('[class]').find((n) =>
      n.getAttribute('class')?.toLowerCase().includes('description')
    )
    if (el) description = el.text.trim()
  }

  // --- Variants (sizes) ---
  let sizeLabels: string[] = []

  // Try buttons with data-value first (common pattern)
  const dataValueButtons = root.querySelectorAll('button[data-value]')
  if (dataValueButtons.length > 0) {
    sizeLabels = dataValueButtons
      .map((b) => b.text.trim())
      .filter((t) => t.length > 0)
  }

  // Try size-related button groups
  if (sizeLabels.length === 0) {
    const sizeContainerSelectors = [
      '[data-testid*="size"]',
      '[data-option-name*="Size"]',
      '[data-option-name*="size"]',
      '[class*="SizeSelector"]',
      '[class*="size-selector"]',
    ]
    for (const sel of sizeContainerSelectors) {
      const container = root.querySelector(sel)
      if (container) {
        const labels = container
          .querySelectorAll('button')
          .map((b) => b.text.trim())
          .filter((t) => t.length > 0)
        if (labels.length > 0) {
          sizeLabels = labels
          break
        }
      }
    }
  }

  // Fallback: <select> options
  if (sizeLabels.length === 0) {
    const selectSelectors = [
      'select[data-option-name*="size"]',
      'select[name*="size"]',
      'select',
    ]
    for (const sel of selectSelectors) {
      const select = root.querySelector(sel)
      if (select) {
        const labels = select
          .querySelectorAll('option')
          .map((o) => o.text.trim())
          .filter((t) => t.length > 0 && !t.toLowerCase().includes('select'))
        if (labels.length > 0) {
          sizeLabels = labels
          break
        }
      }
    }
  }

  const variants = sizeLabels.map((sizeLabel) => ({ sizeLabel }))

  // --- Images ---
  const seen = new Set<string>()
  const imageUrls: string[] = []

  const imgContainerSelectors = [
    '[data-testid*="product-image"]',
    '[class*="ProductImage"]',
    '[class*="product-image"]',
    '[class*="ProductGallery"]',
    '[class*="product-gallery"]',
    '[class*="Gallery"]',
    '[class*="gallery"]',
    'figure',
  ]

  for (const sel of imgContainerSelectors) {
    const container = root.querySelector(sel)
    if (container) {
      for (const img of container.querySelectorAll('img')) {
        const src = img.getAttribute('src') ?? ''
        if (!src.startsWith('http')) continue
        const clean = src.split('?')[0]
        if (!seen.has(clean)) {
          seen.add(clean)
          imageUrls.push(clean)
        }
      }
      if (imageUrls.length > 0) break
    }
  }

  // Last-resort: all images, skip logos/icons
  if (imageUrls.length === 0) {
    for (const img of root.querySelectorAll('img')) {
      const src = img.getAttribute('src') ?? ''
      if (!src.startsWith('http')) continue
      if (src.includes('logo') || src.includes('icon')) continue
      const clean = src.split('?')[0]
      if (!seen.has(clean)) {
        seen.add(clean)
        imageUrls.push(clean)
      }
    }
  }

  const product: ScrapedProduct = { title, description, variants, imageUrls }
  return NextResponse.json(product)
}
