import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { validatePricingTiers } from '@/modules/template-manager'

export async function POST(request: Request) {
  const supabase = createServiceClient()
  const body = await request.json()

  const { category_id, size_label, pricing_tiers } = body

  if (!category_id || typeof category_id !== 'string') {
    return NextResponse.json({ error: 'category_id is required' }, { status: 400 })
  }
  if (!size_label || typeof size_label !== 'string' || !size_label.trim()) {
    return NextResponse.json({ error: 'size_label is required' }, { status: 400 })
  }
  if (!validatePricingTiers(pricing_tiers)) {
    return NextResponse.json(
      { error: 'pricing_tiers must be an array of {min_qty: number, price: number}' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('size_tiers')
    .insert({ category_id, size_label: size_label.trim(), pricing_tiers })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
