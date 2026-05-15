import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendBulkJobSummary } from '@/modules/email-notifier'

export async function POST(req: NextRequest) {
  let body: { bulkJobId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { bulkJobId } = body
  if (!bulkJobId || typeof bulkJobId !== 'string') {
    return NextResponse.json({ error: 'bulkJobId is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Idempotency: check if email already sent
  const { data: job, error: fetchError } = await supabase
    .from('bulk_jobs')
    .select('id, email_sent')
    .eq('id', bulkJobId)
    .single()

  if (fetchError || !job) {
    return NextResponse.json(
      { error: fetchError?.message ?? `Bulk job ${bulkJobId} not found` },
      { status: 404 }
    )
  }

  if (job.email_sent) {
    return NextResponse.json({ sent: false, reason: 'already_sent' })
  }

  // Mark email_sent = true before sending (prevents duplicate sends on retry)
  const { error: updateError } = await supabase
    .from('bulk_jobs')
    .update({ email_sent: true })
    .eq('id', bulkJobId)

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to mark email_sent: ${updateError.message}` },
      { status: 500 }
    )
  }

  try {
    await sendBulkJobSummary(bulkJobId)
  } catch (err) {
    // Roll back email_sent flag so it can be retried
    await supabase
      .from('bulk_jobs')
      .update({ email_sent: false })
      .eq('id', bulkJobId)

    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}
