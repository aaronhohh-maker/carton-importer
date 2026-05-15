'use client'

import { useState, useEffect, useRef } from 'react'
import type { Category, SizeTier, ImportStatus, VariantPricing } from '@/types'

interface ImportClientProps {
  categories: Category[]
}

type ImportRecord = {
  id: string
  status: ImportStatus
  url: string
  processed_data: { title?: string; variants?: VariantPricing[]; error?: string } | null
}

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

const TERMINAL_STATUSES: ImportStatus[] = ['draft', 'published', 'failed', 'deleted']

export default function ImportClient({ categories }: ImportClientProps) {
  const [url, setUrl] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [importRecord, setImportRecord] = useState<ImportRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-detect category from URL
  useEffect(() => {
    if (!url) return
    const detected = categories.find(
      (c) => c.noissue_url_path && url.includes(c.noissue_url_path)
    )
    if (detected) setSelectedCategoryId(detected.id)
  }, [url, categories])

  // Poll status until terminal
  useEffect(() => {
    if (!importRecord) return
    if (TERMINAL_STATUSES.includes(importRecord.status)) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/imports/${importRecord.id}`)
        if (res.ok) {
          const data: ImportRecord = await res.json()
          setImportRecord(data)
          if (TERMINAL_STATUSES.includes(data.status)) {
            if (pollRef.current) clearInterval(pollRef.current)
          }
        }
      } catch {
        // ignore poll errors
      }
    }, 2000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [importRecord?.id, importRecord?.status])

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) ?? null
  const sizeTiers: SizeTier[] = selectedCategory?.size_tiers ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setImportRecord(null)
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          categoryId: selectedCategoryId || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to start import')
        return
      }

      // Kick off polling by fetching initial record
      const importRes = await fetch(`/api/imports/${data.importId}`)
      if (importRes.ok) {
        setImportRecord(await importRes.json())
      } else {
        setImportRecord({ id: data.importId, status: 'pending', url: url.trim(), processed_data: null })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* URL Input */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Product URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.noissue.co/products/..."
            required
            className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
        </div>

        {/* Category Dropdown */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Category
            {selectedCategoryId && (
              <span className="ml-2 text-xs text-zinc-400 font-normal">(auto-detected)</span>
            )}
          </label>
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 bg-white"
          >
            <option value="">— Select category —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Pricing Preview */}
        {selectedCategory && sizeTiers.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-zinc-700 mb-2">Pricing Preview</h3>
            <div className="border border-zinc-200 rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="text-left px-4 py-2 text-zinc-600 font-medium">Size</th>
                    <th className="text-left px-4 py-2 text-zinc-600 font-medium">Tier Breakpoints</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {sizeTiers.map((tier) => (
                    <tr key={tier.id}>
                      <td className="px-4 py-2 text-zinc-800">{tier.size_label}</td>
                      <td className="px-4 py-2 text-zinc-500">
                        {tier.pricing_tiers
                          .map((pt) => `${pt.min_qty}+ @ $${pt.price.toFixed(2)}`)
                          .join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting || !url.trim()}
          className="bg-zinc-900 text-white text-sm px-5 py-2 rounded-md hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Starting import…' : 'Import Product'}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-3">
          {error}
        </div>
      )}

      {/* Status */}
      {importRecord && (
        <div className="border border-zinc-200 rounded-md p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-700">Import Status</span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[importRecord.status]}`}
            >
              {STATUS_LABELS[importRecord.status]}
            </span>
            {!TERMINAL_STATUSES.includes(importRecord.status) && (
              <span className="text-xs text-zinc-400 animate-pulse">Polling…</span>
            )}
          </div>

          {/* Progress indicator */}
          {!TERMINAL_STATUSES.includes(importRecord.status) && (
            <div className="flex items-center gap-2">
              {(['pending', 'scraping', 'processing'] as const).map((step) => (
                <div
                  key={step}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    importRecord.status === step
                      ? 'bg-yellow-400'
                      : (['scraping', 'processing'].includes(importRecord.status) && step === 'pending') ||
                        (importRecord.status === 'processing' && step === 'scraping')
                      ? 'bg-zinc-800'
                      : 'bg-zinc-200'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Success result */}
          {importRecord.status === 'draft' && importRecord.processed_data?.title && (
            <div className="text-sm text-zinc-700">
              <span className="font-medium">Created:</span>{' '}
              {importRecord.processed_data.title}
            </div>
          )}

          {/* Unmatched size warnings */}
          {importRecord.status === 'draft' &&
            importRecord.processed_data?.variants
              ?.filter((v) => !v.matched)
              .map((v) => (
                <div
                  key={v.sizeLabel}
                  className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 rounded px-3 py-1.5"
                >
                  No pricing configured for: {v.sizeLabel}
                </div>
              ))}

          {/* Error message */}
          {importRecord.status === 'failed' && importRecord.processed_data?.error && (
            <div className="text-sm text-red-600">{importRecord.processed_data.error}</div>
          )}
        </div>
      )}
    </div>
  )
}
