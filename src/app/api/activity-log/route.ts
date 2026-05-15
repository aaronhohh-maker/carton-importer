import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { ActivityAction } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const importId = searchParams.get('importId')
  const action = searchParams.get('action') as ActivityAction | null
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const supabase = createServiceClient()

  let query = supabase
    .from('activity_log')
    .select(
      `
      id,
      import_id,
      action,
      changed_fields,
      triggered_by,
      created_at,
      imports!inner ( url, processed_data )
    `
    )
    .order('created_at', { ascending: false })
    .limit(100)

  if (importId) {
    query = query.eq('import_id', importId)
  }

  if (action && ['imported', 'resynced', 'published', 'deleted'].includes(action)) {
    query = query.eq('action', action)
  }

  if (from) {
    query = query.gte('created_at', new Date(from).toISOString())
  }

  if (to) {
    // Include the full "to" day by going to end-of-day
    const toDate = new Date(to)
    toDate.setHours(23, 59, 59, 999)
    query = query.lte('created_at', toDate.toISOString())
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ entries: data ?? [] })
}
