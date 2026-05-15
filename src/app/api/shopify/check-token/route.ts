import { NextResponse } from 'next/server'

export async function GET() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN

  if (!domain || !token) {
    return NextResponse.json({ error: 'SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_API_TOKEN not set' })
  }

  const res = await fetch(`https://${domain}/admin/oauth/access_scopes.json`, {
    headers: { 'X-Shopify-Access-Token': token },
  })

  const data = await res.json()
  return NextResponse.json({ status: res.status, domain, data })
}
