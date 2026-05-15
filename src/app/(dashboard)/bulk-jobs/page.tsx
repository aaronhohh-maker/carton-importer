import { createServiceClient } from '@/lib/supabase/server'
import type { BulkJob } from '@/types'
import BulkJobsClient from './BulkJobsClient'

export const dynamic = 'force-dynamic'

export default async function BulkJobsPage() {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('bulk_jobs')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Bulk Jobs</h1>
        <p className="text-sm text-zinc-500 mt-1">
          History of all CSV batch imports.
        </p>
      </div>

      {error ? (
        <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-4 py-3">
          Failed to load bulk jobs: {error.message}
        </div>
      ) : (
        <BulkJobsClient initialJobs={(data ?? []) as BulkJob[]} />
      )}
    </div>
  )
}
