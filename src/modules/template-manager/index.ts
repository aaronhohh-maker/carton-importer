import type { Category, PricingTier } from '@/types'

/**
 * Detects the matching category for a given noissue product URL.
 * Uses substring match against category.noissue_url_path.
 */
export function detectCategory(url: string, categories: Category[]): Category | null {
  for (const category of categories) {
    if (category.noissue_url_path && url.includes(category.noissue_url_path)) {
      return category
    }
  }
  return null
}

/**
 * Type guard that validates unknown JSON is a valid PricingTier array.
 * Returns true only if json is an array of {min_qty: number, price: number}.
 */
export function validatePricingTiers(json: unknown): json is PricingTier[] {
  if (!Array.isArray(json)) return false
  if (json.length === 0) return false
  return json.every(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).min_qty === 'number' &&
      typeof (item as Record<string, unknown>).price === 'number'
  )
}
