import { NextRequest, NextResponse } from 'next/server'
import { sendImportFailureAlert } from '@/modules/email-notifier'

export async function POST(req: NextRequest) {
  let body: { importId?: string; error?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { importId, error } = body
  if (!importId || typeof importId !== 'string') {
    return NextResponse.json({ error: 'importId is required' }, { status: 400 })
  }
  if (!error || typeof error !== 'string') {
    return NextResponse.json({ error: 'error is required' }, { status: 400 })
  }

  try {
    await sendImportFailureAlert(importId, error)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}
