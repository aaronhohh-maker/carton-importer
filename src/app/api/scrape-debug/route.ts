import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { url } = await req.json()
  const apiKey = process.env.BROWSERLESS_API_KEY!

  const res = await fetch(`https://chrome.browserless.io/content?token=${apiKey}&stealth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, gotoOptions: { waitUntil: 'networkidle2', timeout: 45000 } }),
  })

  const html = await res.text()

  // Extract __NEXT_DATA__ JSON if present
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  const nextData = nextDataMatch ? nextDataMatch[1].trim() : null

  // Find index of h1 to return surrounding product content
  const h1Idx = html.indexOf('<h1')
  const productSection = h1Idx >= 0 ? html.slice(Math.max(0, h1Idx - 500), h1Idx + 50000) : ''

  return NextResponse.json({
    totalSize: html.length,
    hasNextData: !!nextData,
    nextDataPreview: nextData ? nextData.slice(0, 5000) : null,
    productSectionPreview: productSection.slice(0, 8000),
  })
}
