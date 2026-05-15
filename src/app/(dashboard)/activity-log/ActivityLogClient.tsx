'use client'

import { useState, useCallback } from 'react'
import type { ActivityAction } from '@/types'

interface ChangedField {
  old: unknown
  new: unknown
}

interface ActivityEntry {
  id: string
  import_id: string
  action: ActivityAction
  changed_fields: Record<string, ChangedField> | null
  triggered_by: string | null
  created_at: string
  imports: {
    url: string
    processed_data: { title?: string } | null
  } | null
}

interface Props {
  initialEntries: ActivityEntry[]
}

const ACTION_LABELS: Record<ActivityAction, string> = {
  imported: 'Imported',
  resynced: 'Resynced',
  published: 'Published',
  deleted: 'Deleted',
}

const ACTION_COLORS: Record<ActivityAction, string> = {
  imported: 'bg-blue-100 text-blue-700',
  resynced: 'bg-yellow-100 text-yellow-700',
  published: 'bg-green-100 text-green-700',
  deleted: 'bg-zinc-100 text-zinc-500',
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

function productName(entry: ActivityEntry): string {
  const title = entry.imports?.processed_data?.title
  if (title) return title
  const url = entry.imports?.url ?? ''
  try {
    return new URL(url).pathname.split('/').filter(Boolean).pop() ?? url
  } catch {
    return url
  }
}

function changedFieldsSummary(fields: Record<string, ChangedField> | null): string {
  if (!fields) return '—'
  const keys = Object.keys(fields)
  if (keys.length === 0) return '—'
  return keys.join(', ')
}

export default function ActivityLogClient({ initialEntries }: Props) {
  const [entries, setEntries] = useState<ActivityEntry[]>(initialEntries)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterAction, setFilterAction] = useState<ActivityAction | 'all'>('all')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const applyFilters = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterAction !== 'all') params.set('action', filterAction)
      if (filterFrom) params.set('from', filterFrom)
      if (filterTo) params.set('to', filterTo)
      const res = await fetch(`/api/activity-log?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setEntries(json.entries ?? [])
        setPage(1)
      }
    } finally {
      setLoading(false)
    }
  }, [filterAction, filterFrom, filterTo])

  const visibleEntries = entries.slice(0, page * PAGE_SIZE)
  const hasMore = entries.length > page * PAGE_SIZE

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Action</label>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value as ActivityAction | 'all')}
            className="border border-zinc-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
          >
            <option value="all">All actions</option>
            <option value="imported">Imported</option>
            <option value="resynced">Resynced</option>
            <option value="published">Published</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">From</label>
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="border border-zinc-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">To</label>
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="border border-zinc-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
        </div>
        <button
          onClick={applyFilters}
          disabled={loading}
          className="bg-zinc-900 text-white text-sm px-4 py-1.5 rounded-md hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Loading…' : 'Apply'}
        </button>
        <button
          onClick={() => {
            setFilterAction('all')
            setFilterFrom('')
            setFilterTo('')
            setEntries(initialEntries)
            setPage(1)
          }}
          className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Table */}
      {visibleEntries.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 text-sm border border-dashed border-zinc-300 rounded-lg">
          No activity log entries found.
        </div>
      ) : (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="text-left px-4 py-3 text-zinc-600 font-medium">Product</th>
                <th className="text-left px-4 py-3 text-zinc-600 font-medium">Action</th>
                <th className="text-left px-4 py-3 text-zinc-600 font-medium">Changed Fields</th>
                <th className="text-left px-4 py-3 text-zinc-600 font-medium">Triggered By</th>
                <th className="text-left px-4 py-3 text-zinc-600 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visibleEntries.map((entry) => {
                const isExpanded = expandedId === entry.id
                const hasFields =
                  entry.changed_fields && Object.keys(entry.changed_fields).length > 0
                return (
                  <>
                    <tr
                      key={entry.id}
                      className={`transition-colors ${hasFields ? 'cursor-pointer hover:bg-zinc-50' : ''}`}
                      onClick={() => {
                        if (!hasFields) return
                        setExpandedId(isExpanded ? null : entry.id)
                      }}
                    >
                      <td className="px-4 py-3 text-zinc-800 font-medium max-w-[200px] truncate">
                        {productName(entry)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLORS[entry.action]}`}
                        >
                          {ACTION_LABELS[entry.action]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 max-w-[200px] truncate">
                        {changedFieldsSummary(entry.changed_fields)}
                        {hasFields && (
                          <span className="ml-1 text-zinc-400 text-xs">
                            {isExpanded ? '▲' : '▼'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 font-mono text-xs">
                        {entry.triggered_by ? entry.triggered_by.slice(0, 8) + '…' : '—'}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                        {new Date(entry.created_at).toLocaleString('en-AU', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>

                    {/* Expanded diff row */}
                    {isExpanded && entry.changed_fields && (
                      <tr key={`${entry.id}-diff`} className="bg-zinc-50">
                        <td colSpan={5} className="px-4 py-4">
                          <div className="border border-zinc-200 rounded-md overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-white border-b border-zinc-200">
                                <tr>
                                  <th className="text-left px-3 py-2 text-zinc-500 font-medium w-1/4">Field</th>
                                  <th className="text-left px-3 py-2 text-zinc-500 font-medium w-[37.5%]">Old value</th>
                                  <th className="text-left px-3 py-2 text-zinc-500 font-medium w-[37.5%]">New value</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-100">
                                {Object.entries(entry.changed_fields).map(([field, diff]) => (
                                  <tr key={field}>
                                    <td className="px-3 py-2 font-mono text-zinc-700 font-medium">{field}</td>
                                    <td className="px-3 py-2 text-red-600 bg-red-50 max-w-[300px]">
                                      <span className="break-words whitespace-pre-wrap">
                                        {formatValue(diff.old)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-green-700 bg-green-50 max-w-[300px]">
                                      <span className="break-words whitespace-pre-wrap">
                                        {formatValue(diff.new)}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => setPage((p) => p + 1)}
            className="text-sm text-zinc-600 hover:text-zinc-900 underline transition-colors"
          >
            Load more ({entries.length - page * PAGE_SIZE} remaining)
          </button>
        </div>
      )}
    </div>
  )
}
