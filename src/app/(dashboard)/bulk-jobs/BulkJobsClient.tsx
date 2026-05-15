'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { BulkJob, BulkJobImport, BulkJobStatus, ImportStatus } from '@/types'

interface Props {
  initialJobs: BulkJob[]
}

// ── Status badge helpers ─────────────────────────────────────────────────────

const JOB_STATUS_LABEL: Record<BulkJobStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  complete: 'Complete',
  failed: 'Failed',
}

const JOB_STATUS_CLASSES: Record<BulkJobStatus, string> = {
  pending: 'bg-zinc-100 text-zinc-500',
  running: 'bg-yellow-100 text-yellow-700',
  complete: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-600',
}

const IMPORT_STATUS_CLASSES: Record<ImportStatus, string> = {
  pending: 'bg-zinc-100 text-zinc-500',
  scraping: 'bg-blue-100 text-blue-600',
  processing: 'bg-yellow-100 text-yellow-700',
  draft: 'bg-sky-100 text-sky-700',
  published: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-600',
  deleted: 'bg-zinc-100 text-zinc-400',
}

function JobStatusBadge({ status }: { status: BulkJobStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${JOB_STATUS_CLASSES[status]}`}
    >
      {status === 'running' && (
        <svg
          className="animate-spin h-3 w-3"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      )}
      {JOB_STATUS_LABEL[status]}
    </span>
  )
}

function ImportStatusBadge({ status }: { status: ImportStatus }) {
  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${IMPORT_STATUS_CLASSES[status]}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-zinc-200 rounded-full h-1.5 overflow-hidden">
        <div
          className="bg-yellow-400 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-zinc-500 whitespace-nowrap">
        {completed}/{total}
      </span>
    </div>
  )
}

// ── Drill-in panel ───────────────────────────────────────────────────────────

interface DrillInPanelProps {
  job: BulkJob
  onClose: () => void
}

function DrillInPanel({ job, onClose }: DrillInPanelProps) {
  const [imports, setImports] = useState<BulkJobImport[] | null>(
    job.imports ?? null
  )
  const [loading, setLoading] = useState(job.imports === undefined)
  const [error, setError] = useState<string | null>(null)
  const [reimporting, setReimporting] = useState(false)
  const [reimportDone, setReimportDone] = useState(false)

  useEffect(() => {
    if (job.imports !== undefined) {
      setImports(job.imports)
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/bulk-jobs/${job.id}`)
      .then((r) => r.json())
      .then((data: BulkJob) => {
        if (!cancelled) {
          setImports(data.imports ?? [])
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [job.id, job.imports])

  const failedImports = (imports ?? []).filter((imp) => imp.status === 'failed')

  async function handleReimportFailed() {
    if (failedImports.length === 0) return
    setReimporting(true)
    await Promise.allSettled(
      failedImports.map((imp) =>
        fetch('/api/imports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: imp.url }),
        })
      )
    )
    setReimporting(false)
    setReimportDone(true)
  }

  return (
    <tr>
      <td colSpan={7} className="p-0">
        <div className="bg-zinc-50 border-t border-b border-zinc-200 px-6 py-4">
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-zinc-700">
              {job.csv_filename ?? 'Unnamed job'} — URL details
            </span>
            <div className="flex items-center gap-3">
              {failedImports.length > 0 && (
                <button
                  onClick={handleReimportFailed}
                  disabled={reimporting || reimportDone}
                  className="text-xs bg-red-600 text-white px-3 py-1 rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {reimportDone
                    ? 'Re-import queued'
                    : reimporting
                    ? 'Queuing…'
                    : `Re-import failed (${failedImports.length})`}
                </button>
              )}
              <button
                onClick={onClose}
                className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                aria-label="Close panel"
              >
                Close ✕
              </button>
            </div>
          </div>

          {loading && (
            <p className="text-sm text-zinc-400 py-4 text-center">Loading…</p>
          )}
          {error && (
            <p className="text-sm text-red-500 py-4 text-center">{error}</p>
          )}

          {!loading && !error && imports !== null && (
            imports.length === 0 ? (
              <p className="text-sm text-zinc-400 py-4 text-center">
                No URLs in this job.
              </p>
            ) : (
              <div className="border border-zinc-200 rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-white border-b border-zinc-200">
                    <tr>
                      <th className="text-left px-3 py-2 text-zinc-500 font-medium w-2/5">URL</th>
                      <th className="text-left px-3 py-2 text-zinc-500 font-medium">Product name</th>
                      <th className="text-left px-3 py-2 text-zinc-500 font-medium">Status</th>
                      <th className="text-left px-3 py-2 text-zinc-500 font-medium">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {imports.map((imp) => (
                      <tr
                        key={imp.id}
                        className={imp.status === 'failed' ? 'bg-red-50' : ''}
                      >
                        <td className="px-3 py-2 max-w-[260px]">
                          <a
                            href={imp.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline truncate block"
                            title={imp.url}
                          >
                            {imp.url}
                          </a>
                        </td>
                        <td className="px-3 py-2 text-zinc-700 max-w-[200px] truncate">
                          {imp.title ?? '—'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <ImportStatusBadge status={imp.status} />
                        </td>
                        <td className="px-3 py-2 text-red-500 max-w-[200px] truncate">
                          {/* error_message not in BulkJobImport type; show dash */}
                          —
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BulkJobsClient({ initialJobs }: Props) {
  const [jobs, setJobs] = useState<BulkJob[]>(initialJobs)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const hasRunning = useCallback(
    (list: BulkJob[]) => list.some((j) => j.status === 'running'),
    []
  )

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/bulk-jobs')
      if (!res.ok) return
      const data: BulkJob[] = await res.json()
      setJobs(data)
      if (!hasRunning(data)) {
        if (pollingRef.current !== null) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      }
    } catch {
      // silently ignore transient network errors
    }
  }, [hasRunning])

  // Start/stop polling based on running jobs
  useEffect(() => {
    if (hasRunning(jobs)) {
      pollingRef.current = setInterval(fetchJobs, 3000)
    }
    return () => {
      if (pollingRef.current !== null) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // We intentionally only start polling once on mount; fetchJobs updates state

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-400 text-sm border border-dashed border-zinc-300 rounded-lg">
        No bulk jobs yet. Upload a CSV to get started.
      </div>
    )
  }

  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 border-b border-zinc-200">
          <tr>
            <th className="text-left px-4 py-3 text-zinc-600 font-medium">CSV file</th>
            <th className="text-left px-4 py-3 text-zinc-600 font-medium">Submitted</th>
            <th className="text-left px-4 py-3 text-zinc-600 font-medium">Status</th>
            <th className="text-right px-4 py-3 text-zinc-600 font-medium">Total</th>
            <th className="text-right px-4 py-3 text-zinc-600 font-medium">Done</th>
            <th className="text-right px-4 py-3 text-zinc-600 font-medium">Failed</th>
            <th className="text-left px-4 py-3 text-zinc-600 font-medium w-8">Email</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {jobs.map((job) => {
            const isExpanded = expandedId === job.id
            return (
              <>
                <tr
                  key={job.id}
                  className="cursor-pointer hover:bg-zinc-50 transition-colors"
                  onClick={() => toggleExpand(job.id)}
                >
                  {/* CSV filename */}
                  <td className="px-4 py-3 text-zinc-800 font-medium max-w-[200px] truncate">
                    <span title={job.csv_filename ?? undefined}>
                      {job.csv_filename ?? <span className="text-zinc-400 italic">unnamed</span>}
                    </span>
                  </td>

                  {/* Submitted date */}
                  <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                    {new Date(job.created_at).toLocaleString('en-AU', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    {job.status === 'running' ? (
                      <div className="space-y-1">
                        <JobStatusBadge status={job.status} />
                        <ProgressBar
                          completed={job.completed}
                          total={job.total_urls}
                        />
                      </div>
                    ) : (
                      <JobStatusBadge status={job.status} />
                    )}
                  </td>

                  {/* Counts */}
                  <td className="px-4 py-3 text-right text-zinc-600">{job.total_urls}</td>
                  <td className="px-4 py-3 text-right text-green-600">{job.completed}</td>
                  <td className="px-4 py-3 text-right text-red-500">{job.failed}</td>

                  {/* Email sent */}
                  <td className="px-4 py-3 text-center">
                    {job.email_sent ? (
                      <span title="Email sent" className="text-green-600 text-base leading-none">
                        ✓
                      </span>
                    ) : (
                      <span className="text-zinc-300 text-base leading-none">—</span>
                    )}
                  </td>
                </tr>

                {/* Inline drill-in panel */}
                {isExpanded && (
                  <DrillInPanel
                    key={`${job.id}-detail`}
                    job={job}
                    onClose={() => setExpandedId(null)}
                  />
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
