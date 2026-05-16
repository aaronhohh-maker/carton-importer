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
    return NextResponse.json({ error: 'URL must be a noissue.co product URL' }, { status: 400 })
  }

  const apiKey = process.env.BROWSERLESS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'BROWSERLESS_API_KEY environment variable is not set' }, { status: 500 })
  }

  const contentRes = await fetch(
    `https://chrome.browserless.io/content?token=${apiKey}&stealth`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, gotoOptions: { waitUntil: 'networkidle2', timeout: 45000 } }),
    }
  )

  if (!contentRes.ok) {
    const text = await contentRes.text()
    throw new Error(`Browserless /content returned ${contentRes.status}: ${text.slice(0, 200)}`)
  }

  const html = await contentRes.text()
  const root = parse(html)

  // --- JSON-LD structured data (most reliable on noissue.co) ---
  let jsonLd: Record<string, unknown> | null = null
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.text)
      if (parsed?.name) { jsonLd = parsed; break }
    } catch { /* skip malformed */ }
  }

  // --- Title ---
  const title = (jsonLd?.name as string | undefined)?.trim()
    ?? root.querySelector('h1')?.text.trim()
    ?? ''

  // Guard: detect error/bot-challenge pages
  const lowerTitle = title.toLowerCase()
  if (
    !title ||
    lowerTitle.includes('403') ||
    lowerTitle.includes('401') ||
    lowerTitle.includes('404') ||
    lowerTitle.includes('access denied') ||
    lowerTitle.includes('forbidden') ||
    lowerTitle.includes('just a moment') ||
    (lowerTitle.includes('error') && title.length < 30)
  ) {
    throw new Error(`Page blocked or not found — noissue.co returned: "${title}"`)
  }

  // --- Description ---
  // JSON-LD description first; fall back to the intro paragraph (class "text-core-grey-darkest")
  let description = (jsonLd?.description as string | undefined)?.trim() ?? ''
  if (!description) {
    const descEl = root.querySelector('p[class*="text-core-grey-darkest"]')
      ?? root.querySelector('p[class*="font-mori"]')
    if (descEl) description = descEl.text.trim()
  }

  // --- Images ---
  // JSON-LD image array is the cleanest source on noissue.co
  let imageUrls: string[] = []
  const jsonLdImage = jsonLd?.image
  if (jsonLdImage) {
    const raw = Array.isArray(jsonLdImage) ? jsonLdImage : [jsonLdImage]
    imageUrls = raw.filter((s): s is string => typeof s === 'string' && s.startsWith('http'))
  }

  // DOM fallback: look for storyblok CDN images (noissue uses storyblok for assets)
  if (imageUrls.length === 0) {
    const seen = new Set<string>()
    for (const img of root.querySelectorAll('img')) {
      const src = img.getAttribute('src') ?? ''
      if (!src.includes('storyblok') && !src.startsWith('http')) continue
      if (src.includes('logo') || src.includes('icon')) continue
      const clean = src.split('?')[0]
      if (!seen.has(clean)) { seen.add(clean); imageUrls.push(clean) }
    }
  }

  // --- Variants ---
  // noissue uses HeadlessUI radiogroup for "Type" options (White / Premium White / Kraft etc.)
  // aria-label pattern: "Type White", "Type Kraft", "Type Premium White"
  const radioEls = root.querySelectorAll('[role="radio"]')
  let sizeLabels: string[] = radioEls
    .map((el) => (el.getAttribute('aria-label') ?? '').replace(/^Type\s+/i, '').trim())
    .filter((l) => l.length > 0)

  // Fall back to listbox button aria-label for the currently selected size dimension
  if (sizeLabels.length === 0) {
    const listboxBtn = root.querySelector('[role="listbox"] button')
    const btnLabel = listboxBtn?.getAttribute('aria-label') ?? ''
    // aria-label format: "size (lxwxh) 4 x 4 x 2 "" — extract everything after the closing paren
    const match = btnLabel.match(/\)\s*(.+)$/)
    if (match) sizeLabels = [match[1].trim()]
  }

  const variants = sizeLabels.map((sizeLabel) => ({ sizeLabel }))

  const product: ScrapedProduct = { title, description, variants, imageUrls }
  return NextResponse.json(product)
}
