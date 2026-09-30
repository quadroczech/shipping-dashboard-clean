/**
 * Create a Lokia BranchId → carrier mapping and re-aggregate the months it
 * affects, so a newly-identified Packeta sub-carrier (e.g. Sameday) immediately
 * shows up in /zasilky.
 *
 * POST body: {
 *   country_code?: string | null   // null = all countries
 *   branch_id: string              // exact value, or prefix when is_prefix
 *   is_prefix?: boolean
 *   carrier_code: string           // must exist in carriers
 *   delivery_type?: 'home' | 'pickup' | null
 *   last_mile_carrier?: string | null
 *   note?: string | null
 * }
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { reaggregateMonth } from '@/lib/lokia-aggregate'

export const maxDuration = 300

export async function POST(request: Request) {
  const supabase = createAdminClient()

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const branch_id = typeof body.branch_id === 'string' ? body.branch_id.trim() : ''
  const carrier_code = typeof body.carrier_code === 'string' ? body.carrier_code.trim() : ''
  const lokia_carrier_code = body.lokia_carrier_code ? String(body.lokia_carrier_code).trim().toLowerCase() : 'zasilkovna'
  const country_code = body.country_code ? String(body.country_code).trim().toUpperCase() : null
  const is_prefix = body.is_prefix === true
  const delivery_type = body.delivery_type ? String(body.delivery_type) : null
  const last_mile_carrier = body.last_mile_carrier ? String(body.last_mile_carrier).trim() : null
  const note = body.note ? String(body.note).trim() : null

  if (!branch_id || !carrier_code) {
    return NextResponse.json({ ok: false, error: 'branch_id and carrier_code are required' }, { status: 400 })
  }
  if (delivery_type && delivery_type !== 'home' && delivery_type !== 'pickup') {
    return NextResponse.json({ ok: false, error: 'delivery_type must be home, pickup or empty' }, { status: 400 })
  }

  // Carrier must exist, otherwise aggregation would silently skip these shipments.
  const { data: carrier } = await supabase.from('carriers').select('id').eq('code', carrier_code).maybeSingle()
  if (!carrier) {
    return NextResponse.json({ ok: false, error: `Unknown carrier code: ${carrier_code}` }, { status: 400 })
  }

  const { error: insertError } = await supabase.from('lokia_branch_map').insert({
    lokia_carrier_code, country_code, branch_id, is_prefix, carrier_code, delivery_type, last_mile_carrier, note,
  })
  if (insertError) {
    const status = insertError.code === '23505' ? 409 : 500
    return NextResponse.json({ ok: false, error: insertError.message }, { status })
  }

  // Find which months contain documents matching this branch, then re-aggregate them.
  let q = supabase.from('lokia_document_detail_cache').select('month').eq('carrier_code', lokia_carrier_code)
  q = is_prefix ? q.like('branch_id', `${branch_id}%`) : q.eq('branch_id', branch_id)
  if (country_code) q = q.ilike('country_code', country_code)
  const { data: monthRows } = await q
  const months = [...new Set((monthRows ?? []).map((r) => r.month).filter(Boolean) as string[])]

  const reaggregated: Record<string, number> = {}
  for (const month of months) {
    const res = await reaggregateMonth(supabase, month)
    if (res.ok) reaggregated[month] = res.upserts
  }

  return NextResponse.json({ ok: true, months: months.length, reaggregated })
}
