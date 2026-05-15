import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { logActivity } from '@/modules/activity-logger'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  // 1. Load import record
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

  if (importRecord.status === 'deleted') {
    return NextResponse.json(
      { error: 'Import is already deleted.' },
      { status: 400 }
    )
  }

  const previousStatus = importRecord.status

  // 2. Delete from Shopify if a product ID exists
  if (importRecord.shopify_product_id) {
    const domain = process.env.SHOPIFY_STORE_DOMAIN
    const token = process.env.SHOPIFY_ADMIN_API_TOKEN

    if (!domain || !token) {
      return NextResponse.json(
        { error: 'Shopify environment variables are not configured.' },
        { status: 500 }
      )
    }

    const shopifyUrl = `https://${domain}/admin/api/2024-01/products/${importRecord.shopify_product_id}.json`
    const shopifyRes = await fetch(shopifyUrl, {
      method: 'DELETE',
      headers: {
        'X-Shopify-Access-Token': token,
      },
    })

    // 3. 200 = deleted, 404 = already gone — both are acceptable
    if (!shopifyRes.ok && shopifyRes.status !== 404) {
      const body = await shopifyRes.text()
      return NextResponse.json(
        { error: `Shopify API error ${shopifyRes.status}: ${body}` },
        { status: 500 }
      )
    }
  }

  // 4. Update import status to 'deleted' in Supabase
  const { error: updateError } = await supabase
    .from('imports')
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to update local status: ${updateError.message}` },
      { status: 500 }
    )
  }

  // 5. Log the deletion
  await logActivity({
    importId: id,
    action: 'deleted',
    changedFields: {
      status: { old: previousStatus, new: 'deleted' },
    },
  })

  // 6. Return success
  return NextResponse.json({ success: true })
}
