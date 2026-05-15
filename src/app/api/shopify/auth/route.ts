import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!clientId || !appUrl) {
    return NextResponse.json(
      { error: 'SHOPIFY_CLIENT_ID or NEXT_PUBLIC_APP_URL not set' },
      { status: 500 }
    )
  }

  const shop = req.nextUrl.searchParams.get('shop') ?? 'pluscarton.myshopify.com'
  const redirectUri = `${appUrl}/api/shopify/callback`
  const scopes = 'write_products,read_products,write_files,read_files'
  const state = crypto.randomUUID()

  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${clientId}` +
    `&scope=${scopes}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`

  return NextResponse.redirect(authUrl)
}
