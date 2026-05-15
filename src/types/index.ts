export interface PricingTier {
  min_qty: number
  price: number
}

export interface SizeTier {
  id: string
  category_id: string
  size_label: string
  pricing_tiers: PricingTier[]
  created_at: string
}

export interface Category {
  id: string
  name: string
  shopify_collection_id: string | null
  shopify_tag: string | null
  noissue_url_path: string | null
  created_at: string
  size_tiers?: SizeTier[]
}

export interface ScrapedProduct {
  title: string
  description: string
  variants: ScrapedVariant[]
  imageUrls: string[]
}

export interface ScrapedVariant {
  sizeLabel: string
}

export interface VariantPricing {
  sizeLabel: string
  pricingTiers: PricingTier[]
  matched: boolean
}

export interface ProcessedProduct {
  title: string
  description: string
  seoTitle: string
  seoDescription: string
  variants: ProcessedVariant[]
  images: ProcessedImage[]
}

export interface ProcessedVariant {
  sizeLabel: string
  pricingTiers: PricingTier[]
  shopifyImageId?: string
}

export interface ProcessedImage {
  originalUrl: string
  shopifyUrl?: string
  altText: string
}

export type ImportStatus =
  | 'pending'
  | 'scraping'
  | 'processing'
  | 'draft'
  | 'published'
  | 'failed'
  | 'deleted'

export type ActivityAction = 'imported' | 'resynced' | 'published' | 'deleted'

export type BulkJobStatus = 'pending' | 'running' | 'complete' | 'failed'

export interface BulkJobImport {
  id: string
  url: string
  status: ImportStatus
  shopify_product_id: string | null
  title: string | null
}

export interface BulkJob {
  id: string
  status: BulkJobStatus
  total_urls: number
  completed: number
  failed: number
  csv_filename: string | null
  email_sent: boolean
  created_at: string
  finished_at: string | null
  imports?: BulkJobImport[]
}

export interface CsvPreviewRow {
  url: string
  category: string
  valid: boolean
  reason?: string
}

export type ResyncField = 'title' | 'description' | 'images' | 'variants' | 'seo'
