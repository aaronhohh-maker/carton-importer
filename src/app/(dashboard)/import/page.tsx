import { createClient } from '@/lib/supabase/server'
import type { Category } from '@/types'
import ImportClient from './ImportClient'

export const dynamic = 'force-dynamic'

export default async function ImportPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('*, size_tiers(*)')
    .order('name')

  if (error) {
    return (
      <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-4 py-3">
        Failed to load categories: {error.message}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Import Product</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Paste a noissue product URL to create a Shopify draft.
        </p>
      </div>
      <ImportClient categories={(data as Category[]) ?? []} />
    </div>
  )
}
