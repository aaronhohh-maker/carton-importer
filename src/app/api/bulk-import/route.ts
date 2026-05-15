import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface InvalidRow {
  row: number
  url: string
  category: string
  reason: string
}

function parseCSV(text: string): Array<{ url: string; category: string }> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return []

  // Detect header row
  const firstLine = lines[0].toLowerCase()
  const hasHeader = firstLine.includes('url') && firstLine.includes('category')
  const dataLines = hasHeader ? lines.slice(1) : lines

  return dataLines
    .map((line) => {
      // Simple CSV split: split on first comma to handle URLs with commas avoided,
      // but also handle quoted fields
      const match = line.match(/^("(?:[^"]|"")*"|[^,]*),("(?:[^"]|"")*"|.*)$/)
      if (!match) return null
      const url = match[1].replace(/^"|"$/g, '').replace(/""/g, '"').trim()
      const category = match[2].replace(/^"|"$/g, '').replace(/""/g, '"').trim()
      return { url, category }
    })
    .filter((row): row is { url: string; category: string } => row !== null && (!!row.url || !!row.category))
}

function isValidNoissuUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'noissue.co' || parsed.hostname === 'www.noissue.co'
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file field is required' }, { status: 400 })
  }

  if (!file.name.toLowerCase().endsWith('.csv')) {
    return NextResponse.json({ error: 'File must be a .csv' }, { status: 400 })
  }

  const csvText = await file.text()
  const rows = parseCSV(csvText)

  if (rows.length === 0) {
    return NextResponse.json({ error: 'CSV is empty or has no data rows' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Load all categories for validation
  const { data: categoriesData, error: catError } = await supabase
    .from('categories')
    .select('id, name')

  if (catError) {
    return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 })
  }

  const categories = categoriesData ?? []
  interface CategoryRow { id: string; name: string }
  const categoryByName = new Map<string, CategoryRow>(
    (categories as CategoryRow[]).map((c) => [c.name.toLowerCase(), c])
  )

  const validRows: Array<{ url: string; categoryId: string }> = []
  const invalidRows: InvalidRow[] = []

  rows.forEach((row, idx) => {
    const rowNum = idx + 2 // +2: 1-indexed + header row offset
    const reasons: string[] = []

    if (!row.url || !isValidNoissuUrl(row.url)) {
      reasons.push('invalid or missing noissue.co URL')
    }

    const matchedCategory = categoryByName.get(row.category.toLowerCase())
    if (!row.category || !matchedCategory) {
      reasons.push(`unknown category "${row.category}"`)
    }

    if (reasons.length > 0) {
      invalidRows.push({ row: rowNum, url: row.url, category: row.category, reason: reasons.join('; ') })
    } else {
      validRows.push({ url: row.url, categoryId: matchedCategory!.id })
    }
  })

  if (invalidRows.length > 0) {
    return NextResponse.json(
      { error: 'Validation failed', invalidRows },
      { status: 400 }
    )
  }

  // Create bulk_jobs record
  const { data: bulkJob, error: jobError } = await supabase
    .from('bulk_jobs')
    .insert({
      status: 'pending',
      total_urls: validRows.length,
      completed: 0,
      failed: 0,
      csv_filename: file.name,
    })
    .select()
    .single()

  if (jobError || !bulkJob) {
    return NextResponse.json(
      { error: jobError?.message ?? 'Failed to create bulk job' },
      { status: 500 }
    )
  }

  // Create one import record per valid row
  const { error: importsError } = await supabase.from('imports').insert(
    validRows.map((row) => ({
      url: row.url,
      category_id: row.categoryId,
      status: 'pending',
      bulk_job_id: bulkJob.id,
    }))
  )

  if (importsError) {
    // Clean up the bulk job
    await supabase.from('bulk_jobs').delete().eq('id', bulkJob.id)
    return NextResponse.json(
      { error: importsError.message ?? 'Failed to create imports' },
      { status: 500 }
    )
  }

  // Trigger process-bulk-job Edge Function asynchronously
  const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-bulk-job`
  fetch(edgeFunctionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ bulkJobId: bulkJob.id }),
  }).catch(() => {
    // fire-and-forget
  })

  return NextResponse.json(
    { bulkJobId: bulkJob.id, totalUrls: validRows.length, invalidRows: [] },
    { status: 201 }
  )
}
