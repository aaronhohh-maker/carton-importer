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

  // Return first 30k chars — enough to see the product section structure
  return new NextResponse(html.slice(0, 30000), {
    headers: { 'Content-Type': 'text/html' },
  })
}
