import { createClient } from '@/lib/supabase/server'
import type { ImportStatus, ProcessedVariant } from '@/types'
import ProductsClient from './ProductsClient'

export const dynamic = 'force-dynamic'

export interface ImportRow {
  id: string
  url: string
  status: ImportStatus
  category_id: string | null
  shopify_product_id: string | null
  processed_data: {
    title?: string
    variants?: ProcessedVariant[]
    error?: string
  } | null
  created_at: string
  categories: { name: string } | null
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

      <ProductsClient initialImports={imports} />
    </div>
  )
}
