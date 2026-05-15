import { NextRequest, NextResponse } from 'next/server'
import { transferImages, type TransferResult } from '@/modules/image-transferrer'

interface TransferImagesBody {
  imageUrls: string[]
  altTexts: string[]
}

export async function POST(req: NextRequest) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN

  if (!domain || !token) {
    return NextResponse.json(
      { error: 'SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_API_TOKEN must be set' },
      { status: 500 }
    )
  }

  let body: TransferImagesBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { imageUrls, altTexts } = body

  if (!Array.isArray(imageUrls) || !Array.isArray(altTexts)) {
    return NextResponse.json(
      { error: 'imageUrls and altTexts must be arrays' },
      { status: 400 }
    )
  }

  if (imageUrls.length !== altTexts.length) {
    return NextResponse.json(
      { error: 'imageUrls and altTexts must have the same length' },
      { status: 400 }
    )
  }

  const results: TransferResult[] = await transferImages(imageUrls, altTexts)

  return NextResponse.json(results)
}
