import { NextRequest, NextResponse } from 'next/server'
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

  const { chromium } = await import('playwright-core')

  let browser
  try {
    browser = await chromium.connect(
      `wss://chrome.browserless.io?token=${apiKey}`
    )

    const page = await browser.newPage()
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

    // --- Title ---
    let title = ''
    try {
      title = (await page.$eval('h1', (el) => el.textContent?.trim() ?? '')).trim()
    } catch {
      // no h1 found, leave empty
    }

    // --- Description ---
    let description = ''
    try {
      // noissue uses a product description section; try common selectors in priority order
      const descSelectors = [
        '[data-testid="product-description"]',
        '.product-description',
        '.product__description',
        '[class*="ProductDescription"]',
        '[class*="product-description"]',
        '[class*="description"]',
      ]
      for (const sel of descSelectors) {
        const el = await page.$(sel)
        if (el) {
          description = (await el.innerText()).trim()
          break
        }
      }
    } catch {
      // leave empty
    }

    // --- Variants (sizes) ---
    let variants: Array<{ sizeLabel: string }> = []
    try {
      // noissue renders size options as buttons or <option> elements inside a size selector
      // Try button-based size selectors first
      const sizeButtonSelectors = [
        '[data-testid*="size"] button',
        '[data-option-name*="size" i] button',
        '[data-option-name*="Size" i] button',
        '[aria-label*="size" i] button',
        '[class*="SizeSelector"] button',
        '[class*="size-selector"] button',
        'button[data-value]',
      ]

      let sizeLabels: string[] = []

      for (const sel of sizeButtonSelectors) {
        const labels = await page.$$eval(sel, (buttons) =>
          buttons
            .map((b) => b.textContent?.trim() ?? '')
            .filter((t) => t.length > 0)
        )
        if (labels.length > 0) {
          sizeLabels = labels
          break
        }
      }

      // Fallback: <select> dropdown options (skip empty/placeholder options)
      if (sizeLabels.length === 0) {
        const optionSelectors = [
          'select[data-option-name*="size" i] option',
          'select[name*="size" i] option',
          '[class*="size"] select option',
          'select option',
        ]
        for (const sel of optionSelectors) {
          const labels = await page.$$eval(sel, (options) =>
            (options as HTMLOptionElement[])
              .map((o) => o.textContent?.trim() ?? '')
              .filter((t) => t.length > 0 && !t.toLowerCase().includes('select'))
          )
          if (labels.length > 0) {
            sizeLabels = labels
            break
          }
        }
      }

      variants = sizeLabels.map((sizeLabel) => ({ sizeLabel }))
    } catch {
      variants = []
    }

    // --- Images ---
    let imageUrls: string[] = []
    try {
      // Collect all large product images; noissue uses React so images may be in
      // a gallery/slider. We target product-specific image containers first.
      const imgSelectors = [
        '[data-testid*="product-image"] img',
        '[class*="ProductImage"] img',
        '[class*="product-image"] img',
        '[class*="ProductGallery"] img',
        '[class*="product-gallery"] img',
        '[class*="Gallery"] img',
        '[class*="gallery"] img',
        'figure img',
      ]

      const seen = new Set<string>()
      for (const sel of imgSelectors) {
        const srcs = await page.$$eval(sel, (imgs) =>
          (imgs as HTMLImageElement[]).map((img) => img.src).filter((s) => s.startsWith('http'))
        )
        for (const src of srcs) {
          // Strip query params for full-res URL
          const clean = src.split('?')[0]
          if (clean && !seen.has(clean)) {
            seen.add(clean)
            imageUrls.push(clean)
          }
        }
        if (imageUrls.length > 0) break
      }

      // Last-resort: all page images that look like product images (skip icons/logos)
      if (imageUrls.length === 0) {
        const allSrcs = await page.$$eval('img', (imgs) =>
          (imgs as HTMLImageElement[])
            .map((img) => img.src)
            .filter((s) => s.startsWith('http') && !s.includes('logo') && !s.includes('icon'))
        )
        for (const src of allSrcs) {
          const clean = src.split('?')[0]
          if (clean && !seen.has(clean)) {
            seen.add(clean)
            imageUrls.push(clean)
          }
        }
      }
    } catch {
      imageUrls = []
    }

    const product: ScrapedProduct = {
      title,
      description,
      variants,
      imageUrls,
    }

    return NextResponse.json(product)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Scrape failed: ${message}` }, { status: 500 })
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
  }
}
