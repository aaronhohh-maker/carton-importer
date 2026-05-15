'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Category, SizeTier, ImportStatus, VariantPricing, BulkJob, BulkJobImport, CsvPreviewRow } from '@/types'

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
const BULK_TERMINAL_STATUSES = ['complete', 'failed'] as const

// ─── CSV parsing (client-side preview) ───────────────────────────────────────

function parseCSVPreview(
  text: string,
  categories: Category[]
): CsvPreviewRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return []

  const firstLine = lines[0].toLowerCase()
  const hasHeader = firstLine.includes('url') && firstLine.includes('category')
  const dataLines = hasHeader ? lines.slice(1) : lines

  const categoryNames = new Set(categories.map((c) => c.name.toLowerCase()))

  return dataLines
    .map((line): CsvPreviewRow | null => {
      const match = line.match(/^("(?:[^"]|"")*"|[^,]*),("(?:[^"]|"")*"|.*)$/)
      if (!match) return null
      const url = match[1].replace(/^"|"$/g, '').replace(/""/g, '"').trim()
      const category = match[2].replace(/^"|"$/g, '').replace(/""/g, '"').trim()
      if (!url && !category) return null

      const reasons: string[] = []
      let isValidUrl = false
      try {
        const parsed = new URL(url)
        isValidUrl = parsed.hostname === 'noissue.co' || parsed.hostname === 'www.noissue.co'
      } catch {
        isValidUrl = false
      }
      if (!url || !isValidUrl) reasons.push('invalid URL')
      if (!category || !categoryNames.has(category.toLowerCase())) reasons.push(`unknown category`)

      return { url, category, valid: reasons.length === 0, reason: reasons.join('; ') || undefined }
    })
    .filter((r): r is CsvPreviewRow => r !== null)
}

// ─── Single Import Tab ────────────────────────────────────────────────────────

function SingleImportTab({ categories }: { categories: Category[] }) {
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
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">Product URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.noissue.co/products/..."
            required
            className="w-full border border-zinc-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
        </div>

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
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

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

        {!selectedCategoryId && url.trim() && (
          <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Please select a category to continue. Go to{' '}
            <a href="/category-templates" className="underline font-medium">Category Templates</a>{' '}
            to set one up if none appear.
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !url.trim() || !selectedCategoryId}
          className="bg-zinc-900 text-white text-sm px-5 py-2 rounded-md hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Starting import…' : 'Import Product'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-3">
          {error}
        </div>
      )}

      {importRecord && (
        <div className="border border-zinc-200 rounded-md p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-700">Import Status</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[importRecord.status]}`}>
              {STATUS_LABELS[importRecord.status]}
            </span>
            {!TERMINAL_STATUSES.includes(importRecord.status) && (
              <span className="text-xs text-zinc-400 animate-pulse">Polling…</span>
            )}
          </div>

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

          {importRecord.status === 'draft' && importRecord.processed_data?.title && (
            <div className="text-sm text-zinc-700">
              <span className="font-medium">Created:</span> {importRecord.processed_data.title}
            </div>
          )}

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

          {importRecord.status === 'failed' && importRecord.processed_data?.error && (
            <div className="text-sm text-red-600">{importRecord.processed_data.error}</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Bulk Import Tab ──────────────────────────────────────────────────────────

function BulkImportTab({ categories }: { categories: Category[] }) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [previewRows, setPreviewRows] = useState<CsvPreviewRow[]>([])
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bulkJob, setBulkJob] = useState<BulkJob | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        setError('Please upload a .csv file')
        return
      }
      setCsvFile(file)
      setError(null)
      setBulkJob(null)
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        const rows = parseCSVPreview(text, categories)
        setPreviewRows(rows)
      }
      reader.readAsText(file)
    },
    [categories]
  )

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  // Poll bulk job until complete/failed
  const pollBulkJob = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/bulk-jobs/${jobId}`)
        if (res.ok) {
          const data: BulkJob = await res.json()
          setBulkJob(data)
          if (BULK_TERMINAL_STATUSES.includes(data.status as typeof BULK_TERMINAL_STATUSES[number])) {
            clearInterval(pollRef.current!)
            pollRef.current = null
          }
        }
      } catch {
        // ignore poll errors
      }
    }, 3000)
  }, [])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  async function handleSubmit() {
    if (!csvFile) return
    setError(null)
    setIsSubmitting(true)

    try {
      const formData = new FormData()
      formData.append('file', csvFile)

      const res = await fetch('/api/bulk-import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.invalidRows?.length) {
          setError(`Validation failed: ${data.invalidRows.length} invalid row(s). Fix them and re-upload.`)
        } else {
          setError(data.error ?? 'Failed to start bulk import')
        }
        return
      }

      // Fetch initial job state
      const jobRes = await fetch(`/api/bulk-jobs/${data.bulkJobId}`)
      if (jobRes.ok) {
        const jobData: BulkJob = await jobRes.json()
        setBulkJob(jobData)
        pollBulkJob(data.bulkJobId)
      }

      // Reset file state
      setCsvFile(null)
      setPreviewRows([])
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const validCount = previewRows.filter((r) => r.valid).length
  const invalidCount = previewRows.filter((r) => !r.valid).length
  const canSubmit = csvFile !== null && previewRows.length > 0 && invalidCount === 0

  return (
    <div className="space-y-6">
      {/* CSV format hint */}
      <div className="bg-zinc-50 border border-zinc-200 rounded-md p-3 text-xs text-zinc-600 font-mono">
        <div className="text-zinc-400 mb-1 font-sans font-medium text-xs">Expected CSV format:</div>
        <div>url,category</div>
        <div>https://noissue.co/shop/food-papers/custom-coated-paper/,Food Papers</div>
        <div>https://noissue.co/shop/cups/custom-cups/,Cups</div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-md px-6 py-10 text-center cursor-pointer transition-colors ${
          isDragOver
            ? 'border-zinc-600 bg-zinc-50'
            : 'border-zinc-300 hover:border-zinc-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileChange}
        />
        {csvFile ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-zinc-800">{csvFile.name}</p>
            <p className="text-xs text-zinc-500">{previewRows.length} rows detected</p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-zinc-600">Drop a CSV file here or click to browse</p>
            <p className="text-xs text-zinc-400">Accepts .csv only</p>
          </div>
        )}
      </div>

      {/* Preview table */}
      {previewRows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-zinc-700 font-medium">Preview</span>
            {validCount > 0 && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                {validCount} valid
              </span>
            )}
            {invalidCount > 0 && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                {invalidCount} invalid
              </span>
            )}
          </div>
          <div className="border border-zinc-200 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className="text-left px-4 py-2 text-zinc-600 font-medium w-8">#</th>
                  <th className="text-left px-4 py-2 text-zinc-600 font-medium">URL</th>
                  <th className="text-left px-4 py-2 text-zinc-600 font-medium">Category</th>
                  <th className="text-left px-4 py-2 text-zinc-600 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {previewRows.map((row, idx) => (
                  <tr key={idx} className={row.valid ? '' : 'bg-red-50'}>
                    <td className="px-4 py-2 text-zinc-400 text-xs">{idx + 2}</td>
                    <td className="px-4 py-2 text-zinc-700 max-w-xs truncate" title={row.url}>
                      {row.url || <span className="text-zinc-300 italic">empty</span>}
                    </td>
                    <td className="px-4 py-2 text-zinc-700">
                      {row.category || <span className="text-zinc-300 italic">empty</span>}
                    </td>
                    <td className="px-4 py-2">
                      {row.valid ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Valid</span>
                      ) : (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full" title={row.reason}>
                          {row.reason}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-3">
          {error}
        </div>
      )}

      {previewRows.length > 0 && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !canSubmit}
          className="bg-zinc-900 text-white text-sm px-5 py-2 rounded-md hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting
            ? 'Submitting…'
            : invalidCount > 0
            ? `Fix ${invalidCount} invalid row(s) to continue`
            : `Start Bulk Import (${validCount} URLs)`}
        </button>
      )}

      {/* Progress card */}
      {bulkJob && <BulkJobProgressCard job={bulkJob} />}
    </div>
  )
}

// ─── Bulk Job Progress Card ───────────────────────────────────────────────────

function BulkJobProgressCard({ job }: { job: BulkJob }) {
  const isTerminal = BULK_TERMINAL_STATUSES.includes(job.status as typeof BULK_TERMINAL_STATUSES[number])
  const pct = job.total_urls > 0 ? Math.round(((job.completed + job.failed) / job.total_urls) * 100) : 0

  const JOB_STATUS_COLORS: Record<string, string> = {
    pending: 'bg-zinc-100 text-zinc-600',
    running: 'bg-yellow-100 text-yellow-700',
    complete: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  }

  return (
    <div className="border border-zinc-200 rounded-md p-4 space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-zinc-700">Bulk Import</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${JOB_STATUS_COLORS[job.status] ?? 'bg-zinc-100 text-zinc-600'}`}>
          {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
        </span>
        {!isTerminal && (
          <span className="text-xs text-zinc-400 animate-pulse">Processing…</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-zinc-500">
          <span>{job.completed + job.failed} / {job.total_urls} processed</span>
          <span>{pct}%</span>
        </div>
        <div className="w-full bg-zinc-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${job.failed > 0 ? 'bg-red-400' : 'bg-green-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Counts */}
      <div className="flex gap-6 text-sm">
        <div>
          <span className="text-zinc-500">Total</span>{' '}
          <span className="font-medium text-zinc-800">{job.total_urls}</span>
        </div>
        <div>
          <span className="text-zinc-500">Completed</span>{' '}
          <span className="font-medium text-green-700">{job.completed}</span>
        </div>
        <div>
          <span className="text-zinc-500">Failed</span>{' '}
          <span className="font-medium text-red-600">{job.failed}</span>
        </div>
      </div>

      {/* Per-URL rows */}
      {job.imports && job.imports.length > 0 && (
        <div className="border border-zinc-100 rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-100">
              <tr>
                <th className="text-left px-3 py-1.5 text-zinc-500 font-medium">URL</th>
                <th className="text-left px-3 py-1.5 text-zinc-500 font-medium">Title</th>
                <th className="text-left px-3 py-1.5 text-zinc-500 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {(job.imports as BulkJobImport[]).map((imp) => (
                <tr key={imp.id}>
                  <td className="px-3 py-1.5 text-zinc-600 max-w-xs truncate" title={imp.url}>
                    {imp.url}
                  </td>
                  <td className="px-3 py-1.5 text-zinc-600">
                    {imp.title ?? '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[imp.status as ImportStatus] ?? 'bg-zinc-100 text-zinc-600'}`}>
                      {STATUS_LABELS[imp.status as ImportStatus] ?? imp.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {job.finished_at && (
        <p className="text-xs text-zinc-400">
          Finished at {new Date(job.finished_at).toLocaleString()}
        </p>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImportClient({ categories }: ImportClientProps) {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single')

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex border-b border-zinc-200">
        {(['single', 'bulk'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {tab === 'single' ? 'Single URL' : 'Bulk Import'}
          </button>
        ))}
      </div>

      {activeTab === 'single' ? (
        <SingleImportTab categories={categories} />
      ) : (
        <BulkImportTab categories={categories} />
      )}
    </div>
  )
}
