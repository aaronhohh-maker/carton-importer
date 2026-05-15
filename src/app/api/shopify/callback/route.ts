import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const shop = searchParams.get('shop')

  if (!code || !shop) {
    return NextResponse.json({ error: 'Missing code or shop' }, { status: 400 })
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET not set' },
      { status: 500 }
    )
  }

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    return NextResponse.json({ error: `Token exchange failed: ${text}` }, { status: 500 })
  }

  const { access_token } = await tokenRes.json()

  // Display the token — copy it into SHOPIFY_ADMIN_API_TOKEN in Vercel env vars
  return new NextResponse(
    `<html><body style="font-family:monospace;padding:2rem">
      <h2>✅ Shopify token obtained</h2>
      <p>Copy this into <strong>SHOPIFY_ADMIN_API_TOKEN</strong> in your Vercel environment variables:</p>
      <textarea rows="3" style="width:100%;font-size:14px">${access_token}</textarea>
      <p style="color:#666;margin-top:1rem">You can now delete the <code>/api/shopify/auth</code> and <code>/api/shopify/callback</code> routes.</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}
