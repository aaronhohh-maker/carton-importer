import { createServiceClient } from '@/lib/supabase/server'
import ActivityLogClient from './ActivityLogClient'

export const dynamic = 'force-dynamic'

export default async function ActivityLogPage() {
  const supabase = createServiceClient()

  const { data, error } = await supabase
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Activity Log</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Every import action with field-level change history.
        </p>
      </div>

      {error ? (
        <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-4 py-3">
          Failed to load activity log: {error.message}
        </div>
      ) : (
        <ActivityLogClient initialEntries={data ?? []} />
      )}
    </div>
  )
}
