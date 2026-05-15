import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: bulkJob, error: jobError } = await supabase
    .from('bulk_jobs')
    .select('*')
    .eq('id', id)
    .single()

  if (jobError || !bulkJob) {
    return NextResponse.json({ error: 'Bulk job not found' }, { status: 404 })
  }

  const { data: imports, error: importsError } = await supabase
    .from('imports')
    .select('id, url, status, shopify_product_id, processed_data')
    .eq('bulk_job_id', id)
    .order('created_at', { ascending: true })

  if (importsError) {
    return NextResponse.json({ error: importsError.message }, { status: 500 })
  }

  interface ImportRow {
    id: string
    url: string
    status: string
    shopify_product_id: string | null
    processed_data: { title?: string } | null
  }

  // Shape imports: include title from processed_data if available
  const shapedImports = (imports ?? [] as ImportRow[]).map((imp: ImportRow) => ({
    id: imp.id,
    url: imp.url,
    status: imp.status,
    shopify_product_id: imp.shopify_product_id,
    title: (imp.processed_data as { title?: string } | null)?.title ?? null,
  }))

  return NextResponse.json({ ...bulkJob, imports: shapedImports })
}
