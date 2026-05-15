import type { SizeTier, VariantPricing } from '@/types'

/**
 * Maps scraped size labels to pricing tiers from the DB.
 * Matching is case-insensitive against SizeTier.size_label.
 * Unmatched sizes get matched=false and pricingTiers=[].
 */
export function mapPricing(
  sizeLabels: string[],
  sizeTiers: SizeTier[]
): VariantPricing[] {
  return sizeLabels.map((sizeLabel) => {
    const match = sizeTiers.find(
      (tier) => tier.size_label.toLowerCase() === sizeLabel.toLowerCase()
    )
    if (match) {
      return {
        sizeLabel,
        pricingTiers: match.pricing_tiers,
        matched: true,
      }
    }
    return {
      sizeLabel,
      pricingTiers: [],
      matched: false,
    }
  })
}
