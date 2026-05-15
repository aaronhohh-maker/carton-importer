import { createClient } from '@/lib/supabase/server'
import type { ImportStatus } from '@/types'

export const dynamic = 'force-dynamic'

interface ImportRow {
  id: string
  url: string
  status: ImportStatus
  category_id: string | null
  shopify_product_id: string | null
  processed_data: { title?: string } | null
  created_at: string
  categories: { name: string } | null
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

export default async function ProductsPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('imports')
    .select('*, categories(name)')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-4 py-3">
        Failed to load imports: {error.message}
      </div>
    )
  }

  const imports = (data as ImportRow[]) ?? []

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Products</h1>
          <p className="text-sm text-zinc-500 mt-1">
            All imported products and their current status.
          </p>
        </div>
        <a
          href="/import"
          className="bg-zinc-900 text-white text-sm px-4 py-2 rounded-md hover:bg-zinc-700 transition-colors"
        >
          + New Import
        </a>
      </div>

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
                <th className="text-left px-4 py-3 text-zinc-600 font-medium">Source URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {imports.map((row) => {
                const title = row.processed_data?.title ?? null
                const dateStr = new Date(row.created_at).toLocaleDateString('en-AU', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
                return (
                  <tr key={row.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-4 py-3 text-zinc-800 font-medium max-w-[200px] truncate">
                      {title ?? (
                        <span className="text-zinc-400 font-normal italic">
                          {new URL(row.url).pathname.split('/').pop() ?? row.url}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {row.categories?.name ?? <span className="text-zinc-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[row.status]}`}
                      >
                        {STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{dateStr}</td>
                    <td className="px-4 py-3 text-zinc-400 max-w-[200px] truncate">
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-zinc-600 transition-colors underline decoration-zinc-300"
                      >
                        {row.url}
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
