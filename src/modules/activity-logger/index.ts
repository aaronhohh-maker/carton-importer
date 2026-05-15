import { createServiceClient } from '@/lib/supabase/server'
import type { ActivityAction } from '@/types'

export interface LogEntry {
  importId: string
  action: ActivityAction
  changedFields?: Record<string, { old: unknown; new: unknown }>
  triggeredBy?: string
}

export async function logActivity(entry: LogEntry): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase.from('activity_log').insert({
      import_id: entry.importId,
      action: entry.action,
      changed_fields: entry.changedFields ?? null,
      triggered_by: entry.triggeredBy ?? null,
    })
  } catch {
    // Never throw — a log failure must never abort an import
  }
}
