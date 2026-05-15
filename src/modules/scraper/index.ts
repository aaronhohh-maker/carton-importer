import type { ScrapedProduct } from '@/types'

export class ScraperError extends Error {
  constructor(public url: string, message: string) {
    super(message)
    this.name = 'ScraperError'
  }
}

export async function scrapeProduct(url: string): Promise<ScrapedProduct> {
  const res = await fetch('/api/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })

  const data = (await res.json()) as ScrapedProduct | { error: string }

  if (!res.ok || 'error' in data) {
    const message = 'error' in data ? data.error : `HTTP ${res.status}`
    throw new ScraperError(url, message)
  }

  return data
}
