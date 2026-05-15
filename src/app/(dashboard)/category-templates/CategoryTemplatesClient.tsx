'use client'

import { useState, useCallback } from 'react'
import type { Category, SizeTier, PricingTier } from '@/types'
import { validatePricingTiers } from '@/modules/template-manager'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePricingTiersInput(raw: string): { tiers: PricingTier[] | null; error: string | null } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { tiers: null, error: 'Invalid JSON' }
  }
  if (!validatePricingTiers(parsed)) {
    return {
      tiers: null,
      error: 'Must be an array of {"min_qty": number, "price": number}',
    }
  }
  return { tiers: parsed, error: null }
}

function tiersToString(tiers: PricingTier[]): string {
  return JSON.stringify(tiers, null, 2)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SizeTierRowProps {
  tier: SizeTier
  onSave: (id: string, size_label: string, pricing_tiers: PricingTier[]) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function SizeTierRow({ tier, onSave, onDelete }: SizeTierRowProps) {
  const [editing, setEditing] = useState(false)
  const [sizeLabel, setSizeLabel] = useState(tier.size_label)
  const [pricingRaw, setPricingRaw] = useState(tiersToString(tier.pricing_tiers))
  const [pricingError, setPricingError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  function handleEdit() {
    setSizeLabel(tier.size_label)
    setPricingRaw(tiersToString(tier.pricing_tiers))
    setPricingError(null)
    setApiError(null)
    setEditing(true)
  }

  async function handleSave() {
    const { tiers, error } = parsePricingTiersInput(pricingRaw)
    if (error) {
      setPricingError(error)
      return
    }
    setSaving(true)
    setApiError(null)
    try {
      await onSave(tier.id, sizeLabel, tiers!)
      setEditing(false)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <tr className="border-t border-zinc-100">
        <td className="py-2 px-3 text-sm text-zinc-800">{tier.size_label}</td>
        <td className="py-2 px-3 text-sm text-zinc-500 font-mono">
          {tier.pricing_tiers.map((t) => `${t.min_qty}+ → $${t.price}`).join(', ')}
        </td>
        <td className="py-2 px-3 text-right">
          <button
            onClick={handleEdit}
            className="text-xs text-zinc-500 hover:text-zinc-800 mr-3 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(tier.id)}
            className="text-xs text-red-400 hover:text-red-600 transition-colors"
          >
            Delete
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-t border-zinc-100 bg-zinc-50">
      <td className="py-2 px-3">
        <input
          value={sizeLabel}
          onChange={(e) => setSizeLabel(e.target.value)}
          className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          placeholder="e.g. Small"
        />
      </td>
      <td className="py-2 px-3">
        <textarea
          value={pricingRaw}
          onChange={(e) => {
            setPricingRaw(e.target.value)
            setPricingError(null)
          }}
          rows={4}
          className={`w-full text-xs font-mono border rounded px-2 py-1 focus:outline-none focus:ring-1 ${
            pricingError
              ? 'border-red-400 focus:ring-red-400'
              : 'border-zinc-300 focus:ring-zinc-400'
          }`}
        />
        {pricingError && <p className="text-xs text-red-500 mt-1">{pricingError}</p>}
      </td>
      <td className="py-2 px-3 text-right align-top">
        <button
          onClick={handleSave}
          disabled={saving || !sizeLabel.trim()}
          className="text-xs bg-zinc-800 text-white rounded px-2 py-1 hover:bg-zinc-700 disabled:opacity-40 mr-2 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Cancel
        </button>
        {apiError && <p className="text-xs text-red-500 mt-1">{apiError}</p>}
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------

interface AddSizeTierRowProps {
  categoryId: string
  onAdd: (category_id: string, size_label: string, pricing_tiers: PricingTier[]) => Promise<void>
}

function AddSizeTierRow({ categoryId, onAdd }: AddSizeTierRowProps) {
  const [open, setOpen] = useState(false)
  const [sizeLabel, setSizeLabel] = useState('')
  const [pricingRaw, setPricingRaw] = useState('[\n  {"min_qty": 1, "price": 0}\n]')
  const [pricingError, setPricingError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  async function handleAdd() {
    const { tiers, error } = parsePricingTiersInput(pricingRaw)
    if (error) {
      setPricingError(error)
      return
    }
    setSaving(true)
    setApiError(null)
    try {
      await onAdd(categoryId, sizeLabel, tiers!)
      setSizeLabel('')
      setPricingRaw('[\n  {"min_qty": 1, "price": 0}\n]')
      setOpen(false)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to add size tier')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <tr className="border-t border-zinc-100">
        <td colSpan={3} className="py-2 px-3">
          <button
            onClick={() => setOpen(true)}
            className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            + Add size tier
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-t border-zinc-100 bg-blue-50">
      <td className="py-2 px-3">
        <input
          value={sizeLabel}
          onChange={(e) => setSizeLabel(e.target.value)}
          autoFocus
          className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          placeholder="Size label"
        />
      </td>
      <td className="py-2 px-3">
        <textarea
          value={pricingRaw}
          onChange={(e) => {
            setPricingRaw(e.target.value)
            setPricingError(null)
          }}
          rows={4}
          className={`w-full text-xs font-mono border rounded px-2 py-1 focus:outline-none focus:ring-1 ${
            pricingError
              ? 'border-red-400 focus:ring-red-400'
              : 'border-zinc-300 focus:ring-zinc-400'
          }`}
        />
        {pricingError && <p className="text-xs text-red-500 mt-1">{pricingError}</p>}
      </td>
      <td className="py-2 px-3 text-right align-top">
        <button
          onClick={handleAdd}
          disabled={saving || !sizeLabel.trim()}
          className="text-xs bg-zinc-800 text-white rounded px-2 py-1 hover:bg-zinc-700 disabled:opacity-40 mr-2 transition-colors"
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Cancel
        </button>
        {apiError && <p className="text-xs text-red-500 mt-1">{apiError}</p>}
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------

interface CategoryCardProps {
  category: Category
  onUpdateCategory: (id: string, fields: Partial<Category>) => Promise<void>
  onDeleteCategory: (id: string) => Promise<void>
  onAddSizeTier: (category_id: string, size_label: string, pricing_tiers: PricingTier[]) => Promise<void>
  onUpdateSizeTier: (id: string, size_label: string, pricing_tiers: PricingTier[]) => Promise<void>
  onDeleteSizeTier: (id: string, category_id: string) => Promise<void>
}

function CategoryCard({
  category,
  onUpdateCategory,
  onDeleteCategory,
  onAddSizeTier,
  onUpdateSizeTier,
  onDeleteSizeTier,
}: CategoryCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [collectionId, setCollectionId] = useState(category.shopify_collection_id ?? '')
  const [tag, setTag] = useState(category.shopify_tag ?? '')
  const [urlPath, setUrlPath] = useState(category.noissue_url_path ?? '')
  const [saving, setSaving] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  function handleEditOpen() {
    setName(category.name)
    setCollectionId(category.shopify_collection_id ?? '')
    setTag(category.shopify_tag ?? '')
    setUrlPath(category.noissue_url_path ?? '')
    setApiError(null)
    setEditing(true)
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setApiError(null)
    try {
      await onUpdateCategory(category.id, {
        name: name.trim(),
        shopify_collection_id: collectionId || null,
        shopify_tag: tag || null,
        noissue_url_path: urlPath || null,
      })
      setEditing(false)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to save category')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this category and all its size tiers?')) return
    try {
      await onDeleteCategory(category.id)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to delete category')
    }
  }

  const tiers = category.size_tiers ?? []

  return (
    <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-left flex-1"
        >
          <span
            className={`text-zinc-400 transition-transform text-xs ${expanded ? 'rotate-90' : ''}`}
          >
            ▶
          </span>
          <span className="font-medium text-zinc-900">{category.name}</span>
          <span className="text-xs text-zinc-400">({tiers.length} size{tiers.length !== 1 ? 's' : ''})</span>
        </button>
        <div className="flex gap-2">
          <button
            onClick={handleEditOpen}
            className="text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="text-xs text-red-400 hover:text-red-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {apiError && !editing && (
        <div className="px-4 pb-2">
          <p className="text-xs text-red-500">{apiError}</p>
        </div>
      )}

      {/* Inline category edit form */}
      {editing && (
        <div className="border-t border-zinc-100 px-4 py-3 bg-zinc-50 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Shopify Collection ID</label>
            <input
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              placeholder="optional"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Shopify Tag</label>
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              placeholder="optional"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">noissue URL Path</label>
            <input
              value={urlPath}
              onChange={(e) => setUrlPath(e.target.value)}
              className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              placeholder="/shop/food-papers/"
            />
          </div>
          <div className="col-span-2 flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="text-xs bg-zinc-800 text-white rounded px-3 py-1 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
              >
                Cancel
              </button>
            </div>
            {apiError && <p className="text-xs text-red-500">{apiError}</p>}
          </div>
        </div>
      )}

      {/* Size tiers table */}
      {expanded && (
        <div className="border-t border-zinc-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50">
                <th className="py-2 px-3 text-left text-xs font-medium text-zinc-500 w-1/4">
                  Size
                </th>
                <th className="py-2 px-3 text-left text-xs font-medium text-zinc-500">
                  Pricing Tiers
                </th>
                <th className="py-2 px-3 w-32" />
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <SizeTierRow
                  key={tier.id}
                  tier={tier}
                  onSave={onUpdateSizeTier}
                  onDelete={(id) => onDeleteSizeTier(id, category.id)}
                />
              ))}
              <AddSizeTierRow categoryId={category.id} onAdd={onAddSizeTier} />
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add Category form
// ---------------------------------------------------------------------------

interface AddCategoryFormProps {
  onAdd: (name: string) => Promise<void>
}

function AddCategoryForm({ onAdd }: AddCategoryFormProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onAdd(name.trim())
      setName('')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full border-2 border-dashed border-zinc-200 rounded-lg py-3 text-sm text-zinc-400 hover:border-zinc-300 hover:text-zinc-600 transition-colors"
      >
        + New category
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-zinc-200 rounded-lg px-4 py-3 flex items-center gap-3"
      >
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null) }}
          autoFocus
          placeholder="Category name"
          className={`flex-1 text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 ${
            error ? 'border-red-400 focus:ring-red-400' : 'border-zinc-300 focus:ring-zinc-400'
          }`}
        />
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="text-sm bg-zinc-800 text-white rounded px-3 py-1 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Creating…' : 'Create'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null) }}
          className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          Cancel
        </button>
      </form>
      {error && <p className="text-xs text-red-500 px-1">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

interface Props {
  initialCategories: Category[]
}

export default function CategoryTemplatesClient({ initialCategories }: Props) {
  const [categories, setCategories] = useState<Category[]>(initialCategories)

  // --- Category operations ---

  const handleAddCategory = useCallback(async (name: string) => {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error(await res.text())
    const created: Category = await res.json()
    setCategories((prev) =>
      [...prev, { ...created, size_tiers: [] }].sort((a, b) => a.name.localeCompare(b.name))
    )
  }, [])

  const handleUpdateCategory = useCallback(async (id: string, fields: Partial<Category>) => {
    const res = await fetch(`/api/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    if (!res.ok) throw new Error(await res.text())
    const updated: Category = await res.json()
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...updated, size_tiers: c.size_tiers } : c))
    )
  }, [])

  const handleDeleteCategory = useCallback(async (id: string) => {
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    setCategories((prev) => prev.filter((c) => c.id !== id))
  }, [])

  // --- Size tier operations ---

  const handleAddSizeTier = useCallback(
    async (category_id: string, size_label: string, pricing_tiers: PricingTier[]) => {
      const res = await fetch('/api/size-tiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id, size_label, pricing_tiers }),
      })
      if (!res.ok) throw new Error(await res.text())
      const created: SizeTier = await res.json()
      setCategories((prev) =>
        prev.map((c) =>
          c.id === category_id
            ? { ...c, size_tiers: [...(c.size_tiers ?? []), created] }
            : c
        )
      )
    },
    []
  )

  const handleUpdateSizeTier = useCallback(
    async (id: string, size_label: string, pricing_tiers: PricingTier[]) => {
      const res = await fetch(`/api/size-tiers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size_label, pricing_tiers }),
      })
      if (!res.ok) throw new Error(await res.text())
      const updated: SizeTier = await res.json()
      setCategories((prev) =>
        prev.map((c) => ({
          ...c,
          size_tiers: (c.size_tiers ?? []).map((t) => (t.id === id ? updated : t)),
        }))
      )
    },
    []
  )

  const handleDeleteSizeTier = useCallback(async (id: string, category_id: string) => {
    const res = await fetch(`/api/size-tiers/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    setCategories((prev) =>
      prev.map((c) =>
        c.id === category_id
          ? { ...c, size_tiers: (c.size_tiers ?? []).filter((t) => t.id !== id) }
          : c
      )
    )
  }, [])

  return (
    <div className="flex flex-col gap-3">
      {categories.length === 0 && (
        <p className="text-sm text-zinc-400 text-center py-8">
          No categories yet. Create your first one below.
        </p>
      )}

      {categories.map((category) => (
        <CategoryCard
          key={category.id}
          category={category}
          onUpdateCategory={handleUpdateCategory}
          onDeleteCategory={handleDeleteCategory}
          onAddSizeTier={handleAddSizeTier}
          onUpdateSizeTier={handleUpdateSizeTier}
          onDeleteSizeTier={handleDeleteSizeTier}
        />
      ))}

      <AddCategoryForm onAdd={handleAddCategory} />
    </div>
  )
}
