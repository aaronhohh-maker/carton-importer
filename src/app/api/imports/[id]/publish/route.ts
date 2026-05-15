import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  // 1. Load import record and verify it's a draft
  const { data: importRecord, error: fetchError } = await supabase
    .from('imports')
    .select('id, status, shopify_product_id')
    .eq('id', id)
    .single()

  if (fetchError || !importRecord) {
    return NextResponse.json(
      { error: fetchError?.message ?? 'Import not found' },
      { status: 404 }
    )
  }

  if (importRecord.status !== 'draft') {
    return NextResponse.json(
      { error: `Cannot publish import with status '${importRecord.status}'. Must be 'draft'.` },
      { status: 400 }
    )
  }

  if (!importRecord.shopify_product_id) {
    return NextResponse.json(
      { error: 'No Shopify product ID associated with this import.' },
      { status: 400 }
    )
  }

  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN

  if (!domain || !token) {
    return NextResponse.json(
      { error: 'Shopify environment variables are not configured.' },
      { status: 500 }
    )
  }

  // 2. Activate product in Shopify
  const shopifyUrl = `https://${domain}/admin/api/2024-01/products/${importRecord.shopify_product_id}.json`
  const shopifyRes = await fetch(shopifyUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ product: { status: 'active' } }),
  })

  if (!shopifyRes.ok) {
    const body = await shopifyRes.text()
    return NextResponse.json(
      { error: `Shopify API error ${shopifyRes.status}: ${body}` },
      { status: 502 }
    )
  }

  // 3. Update import status to 'published' in Supabase
  const { error: updateError } = await supabase
    .from('imports')
    .update({ status: 'published', updated_at: new Date().toISOString() })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json(
      { error: `Shopify updated but failed to update local status: ${updateError.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
