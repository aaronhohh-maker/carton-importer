import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validatePricingTiers } from '@/modules/template-manager'

type Params = { params: Promise<{ id: string }> }

export async function PUT(request: Request, { params }: Params) {
  const supabase = await createClient()
  const { id } = await params
  const body = await request.json()

  const { size_label, pricing_tiers } = body

  if (size_label !== undefined && (typeof size_label !== 'string' || !size_label.trim())) {
    return NextResponse.json({ error: 'size_label must be a non-empty string' }, { status: 400 })
  }
  if (pricing_tiers !== undefined && !validatePricingTiers(pricing_tiers)) {
    return NextResponse.json(
      { error: 'pricing_tiers must be an array of {min_qty: number, price: number}' },
      { status: 400 }
    )
  }

  const update: Record<string, unknown> = {}
  if (size_label !== undefined) update.size_label = size_label.trim()
  if (pricing_tiers !== undefined) update.pricing_tiers = pricing_tiers

  const { data, error } = await supabase
    .from('size_tiers')
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

  const { error } = await supabase.from('size_tiers').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return new NextResponse(null, { status: 204 })
}
