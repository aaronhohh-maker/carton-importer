export interface TransferResult {
  originalUrl: string
  shopifyUrl: string | null  // null if this image failed
  altText: string
}

interface FileCreateInput {
  alt: string
  contentType: 'IMAGE'
  originalSource: string
}

interface ShopifyMediaImage {
  image: { url: string } | null
}

interface FileCreatePayload {
  fileCreate: {
    files: ShopifyMediaImage[]
    userErrors: Array<{ field: string[]; message: string }>
  }
}

interface GraphQLResponse {
  data?: FileCreatePayload
  errors?: Array<{ message: string }>
}

const FILE_CREATE_MUTATION = `
  mutation fileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        ... on MediaImage {
          image {
            url
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

async function uploadImageToShopify(
  imageUrl: string,
  altText: string
): Promise<string | null> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN

  if (!domain || !token) {
    throw new Error('SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_API_TOKEN must be set')
  }

  const input: FileCreateInput = {
    alt: altText,
    contentType: 'IMAGE',
    originalSource: imageUrl,
  }

  const endpoint = `https://${domain}/admin/api/2024-01/graphql.json`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({
      query: FILE_CREATE_MUTATION,
      variables: { files: [input] },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Shopify GraphQL HTTP ${res.status}: ${text}`)
  }

  const json = (await res.json()) as GraphQLResponse

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Shopify GraphQL errors: ${json.errors.map((e) => e.message).join(', ')}`)
  }

  const payload = json.data?.fileCreate
  if (!payload) {
    throw new Error('Unexpected empty fileCreate payload')
  }

  if (payload.userErrors.length > 0) {
    const msgs = payload.userErrors.map((e) => `${e.field.join('.')}: ${e.message}`).join(', ')
    throw new Error(`Shopify fileCreate userErrors: ${msgs}`)
  }

  // Shopify processes files asynchronously — image.url may be null immediately.
  // We return whatever URL is available; callers should treat null as "processing".
  const file = payload.files[0]
  return file?.image?.url ?? null
}

export async function transferImages(
  imageUrls: string[],
  altTexts: string[]
): Promise<TransferResult[]> {
  const results: TransferResult[] = []

  for (let i = 0; i < imageUrls.length; i++) {
    const originalUrl = imageUrls[i]
    const altText = altTexts[i] ?? ''

    try {
      const shopifyUrl = await uploadImageToShopify(originalUrl, altText)
      results.push({ originalUrl, shopifyUrl, altText })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[image-transferrer] Failed to transfer ${originalUrl}: ${message}`)
      results.push({ originalUrl, shopifyUrl: null, altText })
    }
  }

  return results
}
