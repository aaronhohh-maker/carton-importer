'use client'

import React, { useState, useCallback } from 'react'
import type { ImportStatus, ProcessedVariant, ResyncField } from '@/types'

interface ImportRow {
  id: string
  url: string
  status: ImportStatus
  category_id: string | null
  shopify_product_id: string | null
  processed_data: {
    title?: string
    description?: string
    seoTitle?: string
    seoDescription?: string
    variants?: ProcessedVariant[]
    images?: Array<{ originalUrl: string; shopifyUrl?: string; altText: string }>
    error?: string
  } | null
  created_at: string
  categories: { name: string } | null
}

interface ProductsClientProps {
  initialImports: ImportRow[]
}

// ─── diff types ──────────────────────────────────────────────────────────────

interface DiffEntry {
  old: unknown
  new: unknown
  changed: boolean
}

type DiffResult = Record<string, DiffEntry>

// ─── resync modal field config ───────────────────────────────────────────────

const RESYNC_FIELDS: Array<{ key: ResyncField; label: string; diffKeys: string[] }> = [
  { key: 'title', label: 'Title', diffKeys: ['title'] },
  { key: 'description', label: 'Description', diffKeys: ['description'] },
  { key: 'seo', label: 'SEO (title + description)', diffKeys: ['seoTitle', 'seoDescription'] },
  { key: 'variants', label: 'Variants / Pricing', diffKeys: ['variants'] },
  { key: 'images', label: 'Images', diffKeys: ['imageUrls'] },
]

function truncate(val: unknown, maxLen = 80): string {
  if (val === null || val === undefined) return '—'
  const str =
    typeof val === 'string' ? val : JSON.stringify(val)
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str
}

// ─── Resync Modal ─────────────────────────────────────────────────────────────

type ResyncPhase = 'loading' | 'diff' | 'applying' | 'done'

function ResyncModal({
  importId,
  onClose,
  onSuccess,
}: {
  importId: string
  onClose: () => void
  onSuccess: (updatedData: ImportRow['processed_data']) => void
}) {
  const [phase, setPhase] = useState<ResyncPhase>('loading')
  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [checked, setChecked] = useState<Record<ResyncField, boolean>>({
    title: false,
    description: false,
    seo: false,
    variants: false,
    images: false,
  })
  const [error, setError] = useState<string | null>(null)

  // Fetch diff on mount
  React.useEffect(() => {
    let cancelled = false
    async function fetchDiff() {
      try {
        const res = await fetch(`/api/imports/${importId}/resync`)
        const data = await res.json()
        if (!res.ok || data.error) {
          throw new Error(data.error ?? `HTTP ${res.status}`)
        }
        if (!cancelled) {
          const diffData: DiffResult = data.diff
          setDiff(diffData)
          // Pre-check fields that have changes
          const initial: Record<ResyncField, boolean> = {
            title: false,
            description: false,
            seo: false,
            variants: false,
            images: false,
          }
          for (const field of RESYNC_FIELDS) {
            const anyChanged = field.diffKeys.some((k) => diffData[k]?.changed)
            initial[field.key] = anyChanged
          }
          setChecked(initial)
          setPhase('diff')
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setPhase('diff')
        }
      }
    }
    fetchDiff()
    return () => { cancelled = true }
  }, [importId])

  async function handleApply() {
    const fields = (Object.keys(checked) as ResyncField[]).filter((k) => checked[k])
    if (fields.length === 0) return
    setPhase('applying')
    setError(null)
    try {
      const res = await fetch(`/api/imports/${importId}/resync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      onSuccess(data.updatedImport?.processed_data ?? null)
      setPhase('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPhase('diff')
    }
  }

  const selectedCount = Object.values(checked).filter(Boolean).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-zinc-200 w-full max-w-2xl mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <h2 className="text-sm font-semibold text-zinc-800">Re-sync product</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 min-h-[200px]">
          {phase === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-500">
              <svg
                className="animate-spin h-6 w-6 text-zinc-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">Fetching latest data from noissue…</span>
            </div>
          )}

          {phase === 'applying' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-500">
              <svg
                className="animate-spin h-6 w-6 text-zinc-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">Applying selected fields to Shopify…</span>
            </div>
          )}

          {(phase === 'diff') && diff && (
            <>
              {error && (
                <div className="mb-3 text-xs bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2">
                  {error}
                </div>
              )}
              <p className="text-xs text-zinc-500 mb-3">
                Select which fields to update. Fields with no changes are greyed out.
              </p>
              <div className="border border-zinc-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 border-b border-zinc-200">
                    <tr>
                      <th className="text-left px-3 py-2 text-zinc-500 font-medium w-8"></th>
                      <th className="text-left px-3 py-2 text-zinc-500 font-medium w-32">Field</th>
                      <th className="text-left px-3 py-2 text-zinc-500 font-medium">Current</th>
                      <th className="text-left px-3 py-2 text-zinc-500 font-medium">New</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {RESYNC_FIELDS.map((field) => {
                      const anyChanged = field.diffKeys.some((k) => diff[k]?.changed)
                      const isChecked = checked[field.key]

                      // Build display values
                      const oldParts = field.diffKeys.map((k) => truncate(diff[k]?.old)).join(' / ')
                      const newParts = field.diffKeys.map((k) => truncate(diff[k]?.new)).join(' / ')

                      return (
                        <tr
                          key={field.key}
                          className={anyChanged ? 'bg-white' : 'bg-zinc-50 opacity-60'}
                        >
                          <td className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={!anyChanged}
                              onChange={(e) =>
                                setChecked((prev) => ({ ...prev, [field.key]: e.target.checked }))
                              }
                              className="rounded border-zinc-300 text-zinc-800 focus:ring-zinc-500 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-3 py-2.5 font-medium text-zinc-700 whitespace-nowrap">
                            {field.label}
                            {anyChanged && (
                              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle" />
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-zinc-500 max-w-[200px] truncate">
                            {oldParts}
                          </td>
                          <td className="px-3 py-2.5 max-w-[200px] truncate">
                            <span className={anyChanged ? 'text-zinc-800 font-medium' : 'text-zinc-400'}>
                              {newParts}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {phase === 'diff' && !diff && !error && (
            <div className="text-sm text-zinc-500 py-8 text-center">No diff data available.</div>
          )}

          {phase === 'diff' && !diff && error && (
            <div className="text-sm text-red-600 py-8 text-center">{error}</div>
          )}
        </div>

        {/* Footer */}
        {(phase === 'diff') && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-200 bg-zinc-50">
            <span className="text-xs text-zinc-500">
              {selectedCount === 0
                ? 'No fields selected'
                : `${selectedCount} field${selectedCount > 1 ? 's' : ''} selected`}
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="text-xs px-3 py-1.5 rounded-md border border-zinc-300 text-zinc-600 hover:bg-zinc-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={selectedCount === 0 || !diff}
                className="text-xs px-3 py-1.5 rounded-md bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Apply selected
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ImportStatus, string> = {
  pending: 'Pending',
  scraping: 'Scraping',
  processing: 'Processing',
  draft: 'Draft',
  published: 'Published',
  failed: 'Failed',
  deleted: 'Deleted',
}

const STATUS_COLORS: Record<ImportStatus, string> = {
  pending: 'bg-zinc-100 text-zinc-600',
  scraping: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-yellow-100 text-yellow-700',
  draft: 'bg-blue-100 text-blue-700',
  published: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  deleted: 'bg-zinc-100 text-zinc-500',
}

function StatusBadge({ status }: { status: ImportStatus }) {
  const isSpinning = status === 'scraping' || status === 'processing'
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[status]}`}
    >
      {isSpinning && (
        <svg
          className="animate-spin h-3 w-3"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
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
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      <span className={status === 'deleted' ? 'line-through' : ''}>
        {STATUS_LABELS[status]}
      </span>
    </span>
  )
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl border border-zinc-200 p-6 max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-zinc-700 mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1.5 rounded-md border border-zinc-300 text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="text-xs px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Pricing tier panel ────────────────────────────────────────────────────────

function PricingTierPanel({
  importRow,
  onPublish,
  onResync,
  onDelete,
}: {
  importRow: ImportRow
  onPublish: (id: string) => Promise<void>
  onResync: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const variants = importRow.processed_data?.variants ?? []

  async function handlePublish() {
    setPublishing(true)
    setPublishError(null)
    try {
      await onPublish(importRow.id)
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="bg-zinc-50 border-t border-zinc-200 px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            Pricing Tiers
          </h3>
          {variants.length === 0 ? (
            <p className="text-sm text-zinc-400 italic">No variant pricing data available.</p>
          ) : (
            <div className="border border-zinc-200 rounded-md overflow-hidden bg-white">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="text-left px-3 py-2 text-zinc-500 font-medium">Size</th>
                    <th className="text-left px-3 py-2 text-zinc-500 font-medium">Qty breakpoints &amp; price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {variants.map((variant, i) => (
                    <tr key={i} className="hover:bg-zinc-50">
                      <td className="px-3 py-2 text-zinc-800 font-medium whitespace-nowrap">
                        {variant.sizeLabel}
                      </td>
                      <td className="px-3 py-2 text-zinc-500">
                        {variant.pricingTiers.length > 0
                          ? variant.pricingTiers
                              .map((pt) => `${pt.min_qty}+ @ $${pt.price.toFixed(2)}`)
                              .join(' · ')
                          : <span className="italic text-zinc-400">No pricing</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Failed row error */}
          {importRow.status === 'failed' && importRow.processed_data?.error && (
            <div className="mt-3 text-xs bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2">
              <span className="font-medium">Error:</span> {importRow.processed_data.error}
            </div>
          )}

          {publishError && (
            <div className="mt-3 text-xs bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2">
              {publishError}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 shrink-0">
          {importRow.status === 'draft' && (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="bg-zinc-900 text-white text-xs px-3 py-1.5 rounded-md hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {publishing ? 'Publishing…' : 'Publish to Shopify'}
            </button>
          )}
          <button
            onClick={() => onResync(importRow.id)}
            className="border border-zinc-300 text-zinc-600 text-xs px-3 py-1.5 rounded-md hover:bg-zinc-100 transition-colors whitespace-nowrap"
          >
            Re-sync
          </button>
          {importRow.status !== 'deleted' && (
            <button
              onClick={() => onDelete(importRow.id)}
              className="border border-red-200 text-red-500 text-xs px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors whitespace-nowrap"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-zinc-800 text-white text-sm px-4 py-3 rounded-lg shadow-lg animate-fade-in">
      <span>{message}</span>
      <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors text-xs">
        ✕
      </button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProductsClient({ initialImports }: ProductsClientProps) {
  const [imports, setImports] = useState<ImportRow[]>(initialImports)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({})
  const [resyncId, setResyncId] = useState<string | null>(null)

  const showToast = useCallback((message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 3500)
  }, [])

  const handleRowClick = useCallback((row: ImportRow) => {
    const expandable =
      row.status === 'draft' ||
      row.status === 'published' ||
      row.status === 'failed' ||
      row.status === 'deleted'
    if (!expandable) return
    setExpandedId((prev) => (prev === row.id ? null : row.id))
  }, [])

  const handlePublish = useCallback(async (id: string) => {
    setImports((prev) =>
      prev.map((imp) => (imp.id === id ? { ...imp, status: 'published' as ImportStatus } : imp))
    )
    setExpandedId(null)

    const res = await fetch(`/api/imports/${id}/publish`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setImports((prev) =>
        prev.map((imp) => (imp.id === id ? { ...imp, status: 'draft' as ImportStatus } : imp))
      )
      throw new Error(data.error ?? `HTTP ${res.status}`)
    }

    showToast('Product published to Shopify.')
  }, [showToast])

  const handleResync = useCallback((id: string) => {
    setResyncId(id)
  }, [])

  const handleResyncSuccess = useCallback(
    (id: string, updatedData: ImportRow['processed_data']) => {
      setImports((prev) =>
        prev.map((imp) =>
          imp.id === id ? { ...imp, processed_data: updatedData ?? imp.processed_data } : imp
        )
      )
      setResyncId(null)
      showToast('Re-sync applied successfully.')
    },
    [showToast]
  )

  const handleDeleteRequest = useCallback((id: string) => {
    setConfirmDeleteId(id)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    const id = confirmDeleteId
    if (!id) return
    setConfirmDeleteId(null)

    setDeleteErrors((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })

    const previousStatus = imports.find((imp) => imp.id === id)?.status ?? 'draft'

    setImports((prev) =>
      prev.map((imp) => (imp.id === id ? { ...imp, status: 'deleted' as ImportStatus } : imp))
    )

    const res = await fetch(`/api/imports/${id}/delete`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setImports((prev) =>
        prev.map((imp) =>
          imp.id === id ? { ...imp, status: previousStatus as ImportStatus } : imp
        )
      )
      setDeleteErrors((prev) => ({
        ...prev,
        [id]: data.error ?? `HTTP ${res.status}`,
      }))
      return
    }

    showToast('Product deleted from Shopify. Import record preserved.')
  }, [confirmDeleteId, imports, showToast])

  const handleReimport = useCallback(async (row: ImportRow) => {
    const res = await fetch('/api/imports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: row.url, categoryId: row.category_id }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      showToast(data.error ?? 'Re-import failed.')
      return
    }
    const data = await res.json().catch(() => ({}))
    if (data.import) {
      setImports((prev) => [data.import as ImportRow, ...prev])
    }
    showToast('Re-import started.')
  }, [showToast])

  function getShopifyAdminUrl(shopifyProductId: string) {
    const domain =
      typeof process !== 'undefined'
        ? process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN
        : undefined
    if (domain) {
      return `https://${domain}/admin/products/${shopifyProductId}`
    }
    return `https://admin.shopify.com/products/${shopifyProductId}`
  }

  return (
    <>
      {imports.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 text-sm border border-dashed border-zinc-300 rounded-lg">
          No imports yet.{' '}
          <a href="/import" className="text-zinc-900 underline">
            Import your first product.
          </a>
        </div>
      ) : (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="text-left px-4 py-3 text-zinc-600 font-medium">Product</th>
                <th className="text-left px-4 py-3 text-zinc-600 font-medium">Category</th>
                <th className="text-left px-4 py-3 text-zinc-600 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-zinc-600 font-medium">Date</th>
                <th className="text-left px-4 py-3 text-zinc-600 font-medium">Source</th>
                <th className="text-left px-4 py-3 text-zinc-600 font-medium">Shopify</th>
                <th className="text-left px-4 py-3 text-zinc-600 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((row) => {
                const title = row.processed_data?.title ?? null
                const dateStr = new Date(row.created_at).toLocaleDateString('en-AU', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
                const isExpanded = expandedId === row.id
                const isExpandable =
                  row.status === 'draft' ||
                  row.status === 'published' ||
                  row.status === 'failed' ||
                  row.status === 'deleted'
                const errorText = row.processed_data?.error
                const deleteError = deleteErrors[row.id]
                const isDeleted = row.status === 'deleted'

                return (
                  <React.Fragment key={row.id}>
                    <tr
                      onClick={() => handleRowClick(row)}
                      className={`border-b border-zinc-100 transition-colors ${
                        isExpandable
                          ? 'cursor-pointer hover:bg-zinc-50'
                          : 'hover:bg-zinc-50/50'
                      } ${isExpanded ? 'bg-zinc-50' : ''} ${isDeleted ? 'opacity-60' : ''}`}
                    >
                      <td className="px-4 py-3 text-zinc-800 font-medium max-w-[200px]">
                        <div className="flex items-center gap-1 truncate">
                          {isExpandable && (
                            <svg
                              className={`shrink-0 w-3 h-3 text-zinc-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                          <span className={`truncate ${isDeleted ? 'line-through text-zinc-400' : ''}`}>
                            {title ?? (
                              <span className="text-zinc-400 font-normal italic">
                                {(() => {
                                  try {
                                    return new URL(row.url).pathname.split('/').pop() ?? row.url
                                  } catch {
                                    return row.url
                                  }
                                })()}
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {row.categories?.name ?? <span className="text-zinc-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={row.status} />
                          {row.status === 'failed' && errorText && (
                            <span
                              title={errorText}
                              className="text-red-400 cursor-help text-xs select-none"
                            >
                              ⓘ
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-500">{dateStr}</td>
                      <td className="px-4 py-3 text-zinc-400 max-w-[160px]">
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="truncate block hover:text-zinc-600 transition-colors underline decoration-zinc-300"
                        >
                          {row.url}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        {row.shopify_product_id && !isDeleted ? (
                          <a
                            href={getShopifyAdminUrl(row.shopify_product_id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-blue-600 hover:text-blue-800 underline transition-colors"
                          >
                            View ↗
                          </a>
                        ) : (
                          <span className="text-zinc-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {!isDeleted && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleResync(row.id)
                                }}
                                className="text-xs text-zinc-500 border border-zinc-200 px-2 py-0.5 rounded hover:bg-zinc-100 transition-colors"
                              >
                                Re-sync
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteRequest(row.id)
                                }}
                                className="text-xs text-red-500 border border-red-200 px-2 py-0.5 rounded hover:bg-red-50 transition-colors"
                              >
                                Delete
                              </button>
                            </>
                          )}
                          {isDeleted && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleReimport(row)
                              }}
                              className="text-xs text-zinc-600 border border-zinc-300 px-2 py-0.5 rounded hover:bg-zinc-100 transition-colors whitespace-nowrap"
                            >
                              Re-import
                            </button>
                          )}
                          {deleteError && (
                            <span
                              title={deleteError}
                              className="text-red-400 cursor-help text-xs select-none"
                            >
                              ⓘ
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <PricingTierPanel
                            importRow={row}
                            onPublish={handlePublish}
                            onResync={handleResync}
                            onDelete={handleDeleteRequest}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {confirmDeleteId && (
        <ConfirmDialog
          message="Delete this product from Shopify? The import record will be kept."
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {resyncId && (
        <ResyncModal
          importId={resyncId}
          onClose={() => setResyncId(null)}
          onSuccess={(updatedData) => handleResyncSuccess(resyncId, updatedData)}
        />
      )}
    </>
  )
}
