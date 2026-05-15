// Deno Supabase Edge Function — process-bulk-job
// Triggered with: { bulkJobId: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? ''

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  let bulkJobId: string
  try {
    const body = await req.json()
    bulkJobId = body.bulkJobId
    if (!bulkJobId) throw new Error('bulkJobId is required')
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 400 })
  }

  try {
    // 1. Load bulk job
    const { data: bulkJob, error: jobError } = await supabase
      .from('bulk_jobs')
      .select('*')
      .eq('id', bulkJobId)
      .single()

    if (jobError || !bulkJob) {
      throw new Error(`Bulk job not found: ${jobError?.message ?? bulkJobId}`)
    }

    // 2. Load all pending imports for this job
    const { data: imports, error: importsError } = await supabase
      .from('imports')
      .select('id, url, status')
      .eq('bulk_job_id', bulkJobId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (importsError) {
      throw new Error(`Failed to load imports: ${importsError.message}`)
    }

    const pendingImports = imports ?? []

    // 3. Update bulk job status → 'running'
    await supabase
      .from('bulk_jobs')
      .update({ status: 'running' })
      .eq('id', bulkJobId)

    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/process-import`

    // 4. Process each import sequentially
    for (const importRecord of pendingImports) {
      try {
        const res = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ importId: importRecord.id }),
        })

        if (!res.ok) {
          const errText = await res.text()
          console.error(`[process-bulk-job] Import ${importRecord.id} failed: ${res.status} ${errText}`)
          // Increment failed count
          await supabase.rpc('increment_bulk_job_failed', { job_id: bulkJobId })
        } else {
          // Increment completed count
          await supabase.rpc('increment_bulk_job_completed', { job_id: bulkJobId })
        }
      } catch (importErr) {
        console.error(`[process-bulk-job] Import ${importRecord.id} threw: ${String(importErr)}`)
        await supabase.rpc('increment_bulk_job_failed', { job_id: bulkJobId })
      }
    }

    // 5. Update bulk job: status → 'complete', finished_at = now()
    await supabase
      .from('bulk_jobs')
      .update({ status: 'complete', finished_at: new Date().toISOString() })
      .eq('id', bulkJobId)

    // 6. Notify for email (issue #11 will implement the handler)
    if (appUrl) {
      fetch(`${appUrl}/api/notify-bulk-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulkJobId }),
      }).catch(() => {
        // fire-and-forget
      })
    }

    return new Response(
      JSON.stringify({ success: true, bulkJobId }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Mark job as failed
    await supabase
      .from('bulk_jobs')
      .update({ status: 'failed', finished_at: new Date().toISOString() })
      .eq('id', bulkJobId)

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
