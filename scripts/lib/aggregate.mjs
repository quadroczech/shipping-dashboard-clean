/**
 * Shared carrier-resolution + aggregation logic for the Lokia sync scripts.
 *
 * Resolution order for each cached document:
 *   1. BranchId map  (lokia_branch_map) — distinguishes Packeta sub-carriers
 *      (e.g. RO: BranchId 762 = FAN Courier, 7455-* = Sameday).
 *   2. Service map   (lokia_service_map) — by (carrier_code, service_type, country).
 *   3. CARRIER_MAP   — last-resort raw Lokia carrier code -> our carrier code.
 *
 * Keep this in sync with src/lib/lokia-aggregate.ts (the TypeScript twin used
 * by the API routes).
 */

export const CARRIER_MAP = {
  ppl: 'PPL', gls: 'GLS', zasilkovna: 'PACKETA',
  sp: 'SLOVENSKA_POSTA', cp: 'CESKA_POSTA',
  dhlparcel: 'PPL', dpd: 'DPD',
}

/**
 * Build a (lokiaCarrier, branchId, countryCode) -> mapping-row resolver from
 * lokia_branch_map rows. BranchIds are scoped to the raw Lokia carrier because
 * Packeta and PPL/GLS depots can reuse the same numbers.
 */
export function buildBranchResolver(branchMapRows) {
  const exact = new Map()   // `${carrier} ${COUNTRY} ${branchId}` -> row
  const prefixes = []       // { carrier, cc, branch, row }
  for (const r of branchMapRows ?? []) {
    const carrier = (r.lokia_carrier_code ?? 'zasilkovna').toLowerCase()
    const cc = (r.country_code ?? '').toUpperCase()
    if (r.is_prefix) prefixes.push({ carrier, cc, branch: r.branch_id, row: r })
    else exact.set(`${carrier} ${cc} ${r.branch_id}`, r)
  }
  prefixes.sort((a, b) => b.branch.length - a.branch.length) // longest prefix wins
  return function resolveBranch(lokiaCarrier, branchId, countryCode) {
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

/** Build a (carrierRaw, serviceType, country) -> mapping-row resolver from lokia_service_map rows. */
export function buildServiceResolver(svcMapRows) {
  const map = new Map()
  for (const r of svcMapRows ?? []) {
    map.set(`${r.lokia_carrier_code}:${r.lokia_service_type ?? ''}:${r.country_code ?? ''}`, r)
  }
  return function resolveService(carrierRaw, svcType, cc) {
    return map.get(`${carrierRaw}:${svcType ?? ''}:${cc}`)
        ?? map.get(`${carrierRaw}:${svcType ?? ''}:`)
        ?? map.get(`${carrierRaw}::${cc}`)
        ?? null
  }
}

/**
 * Resolve a single cache row to { carrier, deliveryType, lastMile } or null when
 * the carrier is unknown. `resolveBranch` / `resolveService` come from the builders.
 */
export function resolveRow(row, resolveBranch, resolveService) {
  const carrierRaw = (row.carrier_code ?? '').toLowerCase()
  const countryCode = (row.country_code ?? '').toUpperCase()
  const branchSvc = resolveBranch(carrierRaw, row.branch_id ?? null, countryCode)
  const svc = branchSvc ?? resolveService(carrierRaw, row.service_type, countryCode)
  const carrier = svc?.carrier_code ?? CARRIER_MAP[carrierRaw]
  if (!carrier) return null
  return {
    carrier,
    deliveryType: svc?.delivery_type ?? null,
    lastMile: svc?.last_mile_carrier ?? null,
  }
}

/**
 * Aggregate cache rows into balikobot_stats-ready entries keyed by
 * country x carrier x service_type x delivery_type x last_mile.
 * Returns { entries: Map<key, agg>, unknownCarriers, noCountry, noInfo }.
 */
export function aggregateRows(rows, { resolveBranch, resolveService }) {
  const entries = new Map()
  const unknownCarriers = {}
  let noCountry = 0, noInfo = 0

  for (const row of rows ?? []) {
    if (!row.carrier_code && !row.country_code) { noInfo++; continue }
    const countryCode = (row.country_code ?? '').toUpperCase()
    if (!countryCode) { noCountry++; continue }

    const resolved = resolveRow(row, resolveBranch, resolveService)
    if (!resolved) {
      const raw = (row.carrier_code ?? '').toLowerCase() || '(empty)'
      unknownCarriers[raw] = (unknownCarriers[raw] ?? 0) + 1
      continue
    }

    const serviceType = row.service_type ?? null
    const { carrier, deliveryType, lastMile } = resolved
    const key = `${countryCode}__${carrier}__${serviceType ?? ''}__${deliveryType ?? ''}__${lastMile ?? ''}`
    const e = entries.get(key) ?? {
      countryCode, carrier, serviceType, deliveryType, lastMile,
      shipmentCount: 0, codCount: 0, weightSum: 0, weightCount: 0,
      priceSum: 0, priceCount: 0, currency: null,
    }
    e.shipmentCount++
    if (row.cod_price > 0) e.codCount++
    if (row.weight > 0) { e.weightSum += row.weight; e.weightCount++ }
    if (row.price > 0) { e.priceSum += row.price; e.priceCount++; if (!e.currency) e.currency = row.currency_code }
    entries.set(key, e)
  }

  return { entries, unknownCarriers, noCountry, noInfo }
}
