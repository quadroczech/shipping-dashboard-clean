/**
 * Carrier-resolution + aggregation for Lokia document cache → balikobot_stats.
 *
 * Resolution order for each cached document:
 *   1. BranchId map  (lokia_branch_map) — distinguishes Packeta sub-carriers
 *      (e.g. RO: BranchId 762 = FAN Courier, 7455-* = Sameday).
 *   2. Service map   (lokia_service_map) — by (carrier_code, service_type, country).
 *   3. CARRIER_MAP   — last-resort raw Lokia carrier code → our carrier code.
 *
 * TypeScript twin of scripts/lib/aggregate.mjs — keep the two in sync.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const CARRIER_MAP: Record<string, string> = {
  ppl: 'PPL', gls: 'GLS', zasilkovna: 'PACKETA',
  sp: 'SLOVENSKA_POSTA', cp: 'CESKA_POSTA',
  dhlparcel: 'PPL', dpd: 'DPD',
}

export interface CacheRow {
  carrier_code: string | null
  country_code: string | null
  cod_price: number | null
  weight: number | null
  price: number | null
  currency_code: string | null
  service_type: string | null
  branch_id: string | null
}

export interface BranchMapRow {
  lokia_carrier_code: string
  country_code: string | null
  branch_id: string
  is_prefix: boolean
  carrier_code: string
  delivery_type: string | null
  last_mile_carrier: string | null
}

export interface ServiceMapRow {
  lokia_carrier_code: string
  lokia_service_type: string | null
  country_code: string | null
  carrier_code: string
  delivery_type: string | null
  last_mile_carrier: string | null
}

interface Resolved { carrier_code: string; delivery_type: string | null; last_mile_carrier: string | null }

export function buildBranchResolver(rows: BranchMapRow[]) {
  const exact = new Map<string, BranchMapRow>()
  const prefixes: { carrier: string; cc: string; branch: string; row: BranchMapRow }[] = []
  for (const r of rows ?? []) {
    const carrier = (r.lokia_carrier_code ?? 'zasilkovna').toLowerCase()
    const cc = (r.country_code ?? '').toUpperCase()
    if (r.is_prefix) prefixes.push({ carrier, cc, branch: r.branch_id, row: r })
    else exact.set(`${carrier} ${cc} ${r.branch_id}`, r)
  }
  prefixes.sort((a, b) => b.branch.length - a.branch.length)
  return (lokiaCarrier: string, branchId: string | null, countryCode: string): BranchMapRow | null => {
    if (!branchId) return null
    const car = (lokiaCarrier ?? '').toLowerCase()
    const cc = (countryCode ?? '').toUpperCase()
    return exact.get(`${car} ${cc} ${branchId}`)
        ?? exact.get(`${car}  ${branchId}`)
        ?? prefixes.find((p) => p.carrier === car && p.cc === cc && branchId.startsWith(p.branch))?.row
        ?? prefixes.find((p) => p.carrier === car && p.cc === '' && branchId.startsWith(p.branch))?.row
        ?? null
  }
}

export function buildServiceResolver(rows: ServiceMapRow[]) {
  const map = new Map<string, ServiceMapRow>()
  for (const r of rows ?? []) {
    map.set(`${r.lokia_carrier_code}:${r.lokia_service_type ?? ''}:${r.country_code ?? ''}`, r)
  }
  return (carrierRaw: string, svcType: string | null, cc: string): ServiceMapRow | null =>
    map.get(`${carrierRaw}:${svcType ?? ''}:${cc}`)
      ?? map.get(`${carrierRaw}:${svcType ?? ''}:`)
      ?? map.get(`${carrierRaw}::${cc}`)
      ?? null
}

export function resolveRow(
  row: CacheRow,
  resolveBranch: ReturnType<typeof buildBranchResolver>,
  resolveService: ReturnType<typeof buildServiceResolver>,
): Resolved | null {
  const carrierRaw = (row.carrier_code ?? '').toLowerCase()
  const countryCode = (row.country_code ?? '').toUpperCase()
  const svc = resolveBranch(carrierRaw, row.branch_id ?? null, countryCode)
    ?? resolveService(carrierRaw, row.service_type, countryCode)
  const carrier = svc?.carrier_code ?? CARRIER_MAP[carrierRaw]
  if (!carrier) return null
  return { carrier_code: carrier, delivery_type: svc?.delivery_type ?? null, last_mile_carrier: svc?.last_mile_carrier ?? null }
}

export interface AggEntry {
  countryCode: string; carrier: string
  serviceType: string | null; deliveryType: string | null; lastMile: string | null
  shipmentCount: number; codCount: number
  weightSum: number; weightCount: number
  priceSum: number; priceCount: number; currency: string | null
}

export function aggregateRows(
  rows: CacheRow[],
  branchMap: BranchMapRow[],
  serviceMap: ServiceMapRow[],
): { entries: Map<string, AggEntry>; unknownCarriers: Record<string, number> } {
  const resolveBranch = buildBranchResolver(branchMap)
  const resolveService = buildServiceResolver(serviceMap)
  const entries = new Map<string, AggEntry>()
  const unknownCarriers: Record<string, number> = {}

  for (const row of rows ?? []) {
    if (!row.carrier_code && !row.country_code) continue
    const countryCode = (row.country_code ?? '').toUpperCase()
    if (!countryCode) continue
    const resolved = resolveRow(row, resolveBranch, resolveService)
    if (!resolved) {
      const raw = (row.carrier_code ?? '').toLowerCase() || '(empty)'
      unknownCarriers[raw] = (unknownCarriers[raw] ?? 0) + 1
      continue
    }
    const serviceType = row.service_type ?? null
    const key = `${countryCode}__${resolved.carrier_code}__${serviceType ?? ''}__${resolved.delivery_type ?? ''}__${resolved.last_mile_carrier ?? ''}`
    const e = entries.get(key) ?? {
      countryCode, carrier: resolved.carrier_code,
      serviceType, deliveryType: resolved.delivery_type, lastMile: resolved.last_mile_carrier,
      shipmentCount: 0, codCount: 0, weightSum: 0, weightCount: 0, priceSum: 0, priceCount: 0, currency: null,
    }
    e.shipmentCount++
    if (row.cod_price && row.cod_price > 0) e.codCount++
    if (row.weight && row.weight > 0) { e.weightSum += row.weight; e.weightCount++ }
    if (row.price && row.price > 0) { e.priceSum += row.price; e.priceCount++; if (!e.currency) e.currency = row.currency_code }
    entries.set(key, e)
  }
  return { entries, unknownCarriers }
}

/**
 * Recompute balikobot_stats for a single month from the document cache, applying
 * the branch + service maps. Deletes and re-inserts the month's rows.
 */
export async function reaggregateMonth(
  supabase: SupabaseClient,
  month: string,
): Promise<{ ok: boolean; upserts: number; shipments: number; error?: string }> {
  const cacheRows: CacheRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('lokia_document_detail_cache')
      .select('carrier_code, country_code, cod_price, weight, price, currency_code, service_type, branch_id')
      .eq('month', month)
      .range(from, from + PAGE - 1)
    if (error) return { ok: false, upserts: 0, shipments: 0, error: error.message }
    if (!data || data.length === 0) break
    cacheRows.push(...(data as CacheRow[]))
    if (data.length < PAGE) break
  }

  const [{ data: branchMap }, { data: serviceMap }, { data: countries }, { data: carriers }] = await Promise.all([
    supabase.from('lokia_branch_map').select('lokia_carrier_code, country_code, branch_id, is_prefix, carrier_code, delivery_type, last_mile_carrier'),
    supabase.from('lokia_service_map').select('lokia_carrier_code, lokia_service_type, country_code, carrier_code, delivery_type, last_mile_carrier'),
    supabase.from('countries').select('id, code'),
    supabase.from('carriers').select('id, code'),
  ])
  if (!countries || !carriers) return { ok: false, upserts: 0, shipments: 0, error: 'Failed to load countries/carriers' }

  const countryMap = new Map(countries.map((c) => [c.code.toUpperCase(), c.id]))
  const carrierMap = new Map(carriers.map((c) => [c.code, c.id]))
  const { entries } = aggregateRows(cacheRows, (branchMap ?? []) as BranchMapRow[], (serviceMap ?? []) as ServiceMapRow[])

  await supabase.from('balikobot_stats').delete().eq('month', month)
  let upserts = 0
  for (const agg of entries.values()) {
    const countryId = countryMap.get(agg.countryCode)
    const carrierId = carrierMap.get(agg.carrier)
    if (!countryId || !carrierId) continue
    const { error } = await supabase.from('balikobot_stats').insert({
      country_id: countryId, carrier_id: carrierId, month,
      service_type: agg.serviceType ?? null,
      delivery_type: agg.deliveryType ?? null,
      last_mile_carrier: agg.lastMile ?? null,
      shipment_count: agg.shipmentCount, cod_count: agg.codCount,
      avg_weight: agg.weightCount > 0 ? agg.weightSum / agg.weightCount : null,
      avg_shipping_price: agg.priceCount > 0 ? agg.priceSum / agg.priceCount : null,
      shipping_currency: agg.currency ?? null,
      synced_at: new Date().toISOString(),
    })
    if (!error) upserts++
  }
  const shipments = [...entries.values()].reduce((s, a) => s + a.shipmentCount, 0)
  return { ok: true, upserts, shipments }
}
