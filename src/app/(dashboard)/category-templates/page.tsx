import { createClient } from '@/lib/supabase/server'
import type { Category } from '@/types'
import CategoryTemplatesClient from './CategoryTemplatesClient'

export const dynamic = 'force-dynamic'

export default async function CategoryTemplatesPage() {
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
        <h1 className="text-2xl font-semibold text-zinc-900">Category Templates</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Configure product categories and per-size pricing tiers.
        </p>
      </div>
      <CategoryTemplatesClient initialCategories={(data as Category[]) ?? []} />
    </div>
  )
}
