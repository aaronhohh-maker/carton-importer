import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function PUT(request: Request, { params }: Params) {
  const supabase = await createClient()
  const { id } = await params
  const body = await request.json()

  const { name, shopify_collection_id, shopify_tag, noissue_url_path } = body

  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (name !== undefined) update.name = name.trim()
  if (shopify_collection_id !== undefined) update.shopify_collection_id = shopify_collection_id
  if (shopify_tag !== undefined) update.shopify_tag = shopify_tag
  if (noissue_url_path !== undefined) update.noissue_url_path = noissue_url_path

  const { data, error } = await supabase
    .from('categories')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { id } = await params

  const { error } = await supabase.from('categories').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return new NextResponse(null, { status: 204 })
}
