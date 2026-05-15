import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { logActivity } from '@/modules/activity-logger'

export async function POST(req: NextRequest) {
  try {
  let body: { url?: string; categoryId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { url, categoryId } = body

  if (!url || typeof url !== 'string' || !url.trim()) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  if (!categoryId) {
    return NextResponse.json({ error: 'Please select a category before importing' }, { status: 400 })
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Database not configured. Check Vercel environment variables.' }, { status: 500 })
  }

  const supabase = createServiceClient()

  // 1. Create import record
  const { data: importRecord, error: insertError } = await supabase
    .from('imports')
    .insert({
      url: url.trim(),
      category_id: categoryId ?? null,
      status: 'pending',
    })
    .select()
    .single()

  if (insertError || !importRecord) {
    return NextResponse.json(
      { error: insertError?.message ?? 'Failed to create import' },
      { status: 500 }
    )
  }

  // Log the 'imported' action immediately when import record is created
  await logActivity({
    importId: importRecord.id,
    action: 'imported',
  })

  // 2. Trigger edge function asynchronously (fire-and-forget)
  const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-import`
  fetch(edgeFunctionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ importId: importRecord.id }),
  }).catch(() => {
    // fire-and-forget — errors handled inside edge function
  })

  return NextResponse.json({ importId: importRecord.id }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
