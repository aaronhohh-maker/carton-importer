import type { VariantPricing } from '@/types'

interface CreateDraftProductParams {
  title: string
  description: string
  categoryName: string
  shopifyCollectionId: string | null
  shopifyTag: string | null
  variants: VariantPricing[]
}

interface ShopifyVariant {
  id: number
  title: string
  price: string
}

interface ShopifyProduct {
  id: number
  variants: ShopifyVariant[]
}

export class ShopifyPublisherError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShopifyPublisherError'
  }
}

async function shopifyFetch(path: string, options: RequestInit): Promise<Response> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN

  if (!domain || !token) {
    throw new ShopifyPublisherError(
      'SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_API_TOKEN must be set'
    )
  }

  const url = `https://${domain}/admin/api/2024-01${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
      ...(options.headers ?? {}),
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new ShopifyPublisherError(
      `Shopify API ${res.status} for ${path}: ${body}`
    )
  }

  return res
}

export async function createDraftProduct(
  params: CreateDraftProductParams
): Promise<{ shopifyProductId: string }> {
  const { title, description, shopifyCollectionId, shopifyTag, variants } = params

  // Build variant objects — use first tier price as Shopify price fallback
  const shopifyVariants = variants.map((v) => ({
    title: v.sizeLabel,
    price:
      v.pricingTiers.length > 0
        ? String(v.pricingTiers[0].price.toFixed(2))
        : '0.00',
  }))

  // 1. Create the draft product
  const productRes = await shopifyFetch('/products.json', {
    method: 'POST',
    body: JSON.stringify({
      product: {
        title,
        body_html: description,
        status: 'draft',
        tags: shopifyTag ?? undefined,
        variants: shopifyVariants.length > 0 ? shopifyVariants : [{ title: 'Default', price: '0.00' }],
      },
    }),
  })

  const productData = (await productRes.json()) as { product: ShopifyProduct }
  const product = productData.product

  // 2. Set custom.pricing_tiers metafield on each variant
  await Promise.all(
    product.variants.map(async (shopifyVariant, idx) => {
      const variantPricing = variants[idx]
      if (!variantPricing) return

      await shopifyFetch(
        `/products/${product.id}/variants/${shopifyVariant.id}/metafields.json`,
        {
          method: 'POST',
          body: JSON.stringify({
            metafield: {
              namespace: 'custom',
              key: 'pricing_tiers',
              value: JSON.stringify(variantPricing.pricingTiers),
              type: 'json',
            },
          }),
        }
      )
    })
  )

  // 3. Add to collection if shopifyCollectionId provided
  if (shopifyCollectionId) {
    await shopifyFetch('/collects.json', {
      method: 'POST',
      body: JSON.stringify({
        collect: {
          product_id: product.id,
          collection_id: shopifyCollectionId,
        },
      }),
    })
  }

  return { shopifyProductId: String(product.id) }
}
