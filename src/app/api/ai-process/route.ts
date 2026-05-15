import { NextRequest, NextResponse } from 'next/server'
import { processContent } from '@/modules/ai-processor'
import type { RawContent, ProcessedContent } from '@/modules/ai-processor'

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY environment variable is not set' },
      { status: 500 }
    )
  }

  let body: { raw?: RawContent }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { raw } = body
  if (!raw) {
    return NextResponse.json({ error: 'Missing required field: raw' }, { status: 400 })
  }

  if (
    typeof raw.title !== 'string' ||
    typeof raw.description !== 'string' ||
    typeof raw.categoryName !== 'string' ||
    !Array.isArray(raw.imageUrls)
  ) {
    return NextResponse.json(
      { error: 'Invalid raw content: title, description, categoryName (strings) and imageUrls (array) are required' },
      { status: 400 }
    )
  }

  try {
    const processed: ProcessedContent = await processContent(raw)
    return NextResponse.json(processed)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `AI processing failed: ${message}` }, { status: 500 })
  }
}
