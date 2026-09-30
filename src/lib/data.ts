/**
 * Central data-fetching helpers (server-side, using Supabase)
 * All functions return typed data or empty arrays/null on error.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  Country,
  Carrier,
  CountryCarrier,
  CarrierBasePrice,
  CustomerPrice,
  ReturnPrice,
  Surcharge,
  CarrierSurcharge,
  Invoice,
  ExchangeRate,
  BalikobotShipmentStats,
  ProfitabilityRow,
  SurchargeBreakdown,
  DashboardStats,
  Currency,
  SurchargeType,
  DeliveryType,
  LokiaBranchMap,
  UnmappedBranch,
} from '@/types'
import { DEFAULT_EXCHANGE_RATES, SURCHARGE_TYPE_LABELS, toCZK } from '@/lib/constants'
import { buildBranchResolver } from '@/lib/lokia-aggregate'

// ─── Countries ────────────────────────────────────────────────────────────────

export async function getCountries(): Promise<Country[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('countries')
    .select('*')
    .order('code')
  if (error) { console.error(error); return [] }
  return data as Country[]
}

// ─── Carriers ─────────────────────────────────────────────────────────────────

export async function getCarriers(): Promise<Carrier[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('carriers')
    .select('*')
    .order('name')
  if (error) { console.error(error); return [] }
  return data as Carrier[]
}

// ─── Country–Carrier combos ───────────────────────────────────────────────────

export async function getCountryCarriers(): Promise<CountryCarrier[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('country_carriers')
    .select('*, country:countries(*), carrier:carriers(*)')
    .eq('is_active', true)
  if (error) { console.error(error); return [] }
  return data as CountryCarrier[]
}

/**
 * Like getCountryCarriers() but returns deactivated routes too.
 *
 * Only the pricing table (/cenik) uses this — it shows deactivated routes
 * greyed/red so they can be toggled back on, while keeping their full price
 * history. Every other consumer (profitability matrix, dashboards, analytics)
 * goes through getCountryCarriers() and therefore silently excludes
 * deactivated routes from all margins and statistics.
 */
export async function getAllCountryCarriers(): Promise<CountryCarrier[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('country_carriers')
    .select('*, country:countries(*), carrier:carriers(*)')
  if (error) { console.error(error); return [] }
  return data as CountryCarrier[]
}

/**
 * Set of `${country_id}|${carrier_id}` keys for currently active routes.
 * balikobot_stats rows are keyed by (country_id, carrier_id) — not by
 * country_carrier_id — so analytics filters its shipment stats through this
 * set to drop volumes belonging to deactivated routes.
 */
export async function getActiveRouteKeys(): Promise<Set<string>> {
  const countryCarriers = await getCountryCarriers()
  return new Set(countryCarriers.map((cc) => `${cc.country_id}|${cc.carrier_id}`))
}

// ─── Customer prices (latest active) ─────────────────────────────────────────

export async function getCustomerPrices(): Promise<CustomerPrice[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('customer_prices')
    .select('*, country_carrier:country_carriers(*, country:countries(*), carrier:carriers(*))')
    .lte('valid_from', today)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
  if (error) { console.error(error); return [] }
  return data as CustomerPrice[]
}

// ─── Carrier base prices (latest active, up to 2kg weight band) ──────────────

export async function getCarrierBasePrices(weightKg = 1): Promise<CarrierBasePrice[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('carrier_base_prices')
    .select('*, country_carrier:country_carriers(*, country:countries(*), carrier:carriers(*))')
    .lt('weight_from', weightKg)
    .gte('weight_to', weightKg)
    .lte('valid_from', today)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
  if (error) { console.error(error); return [] }
  return data as CarrierBasePrice[]
}

// ─── Return prices ────────────────────────────────────────────────────────────

export async function getReturnPrices(): Promise<ReturnPrice[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('return_prices')
    .select('*, country_carrier:country_carriers(*, country:countries(*), carrier:carriers(*))')
    .lte('valid_from', today)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
  if (error) { console.error(error); return [] }
  return data as ReturnPrice[]
}

// ─── Carrier-level surcharges (fuel / toll) ───────────────────────────────────

export async function getCarrierSurcharges(): Promise<CarrierSurcharge[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('carrier_surcharges')
    .select('*, carrier:carriers(*)')
    .lte('valid_from', today)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
    .order('type')
  if (error) { console.error(error); return [] }

  // Enforce the "one active rate per (carrier, type)" invariant defensively.
  // Convention (docs/HOW-IT-WORKS.md): when a new fuel/toll rate is added, the previous
  // record must be closed (valid_to = new valid_from − 1). If that step is
  // missed, two records stay active on the same day — and getProfitabilityMatrix
  // sums every active record, so the surcharge gets double-counted and silently
  // corrupts every margin for that carrier. Keep only the most recent rate
  // (latest valid_from; tie-broken by id for determinism) so the matrix and all
  // other consumers of the *current* rate stay correct even if the data drifts.
  const latestByKey = new Map<string, CarrierSurcharge>()
  for (const cs of data as CarrierSurcharge[]) {
    const key = `${cs.carrier_id}|${cs.type}`
    const current = latestByKey.get(key)
    const isMoreRecent =
      !current ||
      cs.valid_from > current.valid_from ||
      (cs.valid_from === current.valid_from && cs.id > current.id)
    if (isMoreRecent) latestByKey.set(key, cs)
  }
  return [...latestByKey.values()].sort((a, b) => a.type.localeCompare(b.type))
}

export async function getAllCarrierSurcharges(): Promise<CarrierSurcharge[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('carrier_surcharges')
    .select('*, carrier:carriers(*)')
    .order('valid_from', { ascending: true })
  if (error) { console.error(error); return [] }
  return data as CarrierSurcharge[]
}

// ─── Active per-route surcharges (COD, address_delivery, etc.) ───────────────

export async function getSurcharges(): Promise<Surcharge[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('surcharges')
    .select('*, country_carrier:country_carriers(*, country:countries(*), carrier:carriers(*))')
    .lte('valid_from', today)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
    .order('type')
  if (error) { console.error(error); return [] }
  return data as Surcharge[]
}

// ─── Exchange rates (latest per currency) ─────────────────────────────────────

export async function getExchangeRates(): Promise<Record<Currency, number>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('*')
    .eq('to_currency', 'CZK')
    .order('date', { ascending: false })
  if (error || !data) return DEFAULT_EXCHANGE_RATES

  const rates: Partial<Record<Currency, number>> = {}
  for (const row of data as ExchangeRate[]) {
    if (!rates[row.from_currency]) {
      rates[row.from_currency] = row.rate
    }
  }
  return { ...DEFAULT_EXCHANGE_RATES, ...rates }
}

// ─── Balíkobot stats ─────────────────────────────────────────────────────────

export async function getBalikobotStats(): Promise<BalikobotShipmentStats[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('balikobot_stats')
    .select('*, country:countries(*), carrier:carriers(*)')
    .order('month', { ascending: false })
  if (error) { console.error(error); return [] }
  return data as BalikobotShipmentStats[]
}

// ─── Lokia BranchId → carrier mapping (Packeta sub-carriers) ───────────────────

export async function getBranchMappings(): Promise<LokiaBranchMap[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('lokia_branch_map')
    .select('*')
    .order('country_code', { ascending: true })
    .order('branch_id', { ascending: true })
  if (error) { console.error(error); return [] }
  return data as LokiaBranchMap[]
}

/**
 * Packeta BranchIds seen in the cache that aren't covered by any lokia_branch_map
 * entry AND carry enough volume to plausibly be a distinct sub-carrier — surfaced
 * in /zasilky so a new one can be mapped in one click.
 *
 * Packeta assigns a unique BranchId per pickup *location*, so the raw list is
 * hundreds of one-off IDs (a few shipments each) that are already correctly
 * bucketed by service type. A real hidden carrier (e.g. FAN, Sameday) shows up
 * as a high-volume id or a prefix family, so we only flag ids above this floor
 * to keep the panel signal — not location noise.
 */
const MIN_UNMAPPED_BRANCH_DOCS = 50

export async function getUnmappedBranches(): Promise<UnmappedBranch[]> {
  const supabase = createAdminClient()
  const [{ data: counts, error }, mappings] = await Promise.all([
    supabase.rpc('lokia_branch_counts'),
    getBranchMappings(),
  ])
  if (error) { console.error(error); return [] }
  const resolveBranch = buildBranchResolver(mappings)
  return ((counts ?? []) as UnmappedBranch[])
    .filter((r) => r.doc_count >= MIN_UNMAPPED_BRANCH_DOCS)
    .filter((r) => !resolveBranch('zasilkovna', r.branch_id, r.country_code))
    .sort((a, b) => b.doc_count - a.doc_count)
}

// ─── All per-route surcharges including historical (for analytics) ─────────────

export async function getAllSurcharges(): Promise<Surcharge[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('surcharges')
    .select('*, country_carrier:country_carriers(*, country:countries(*), carrier:carriers(*))')
    .order('valid_from', { ascending: true })
  if (error) { console.error(error); return [] }
  return data as Surcharge[]
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export async function getInvoices(): Promise<Invoice[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('invoices')
    .select('*, country_carrier:country_carriers(*, country:countries(*), carrier:carriers(*))')
    .order('invoice_date', { ascending: false })
    .limit(100)
  if (error) { console.error(error); return [] }
  return data as Invoice[]
}

// ─── Core computation: Profitability matrix ───────────────────────────────────

export async function getProfitabilityMatrix(weightKg = 2): Promise<ProfitabilityRow[]> {
  const [
    countryCarriers,
    customerPrices,
    basePrices,
    surcharges,
    carrierSurcharges,
    returnPrices,
    rates,
  ] = await Promise.all([
    getCountryCarriers(),
    getCustomerPrices(),
    getCarrierBasePrices(weightKg),
    getSurcharges(),
    getCarrierSurcharges(),
    getReturnPrices(),
    getExchangeRates(),
  ])

  // Index carrier-level fuel/toll by carrier_id for fast lookup
  const carrierSurchargeMap = new Map<string, CarrierSurcharge[]>()
  for (const cs of carrierSurcharges) {
    if (!carrierSurchargeMap.has(cs.carrier_id)) carrierSurchargeMap.set(cs.carrier_id, [])
    carrierSurchargeMap.get(cs.carrier_id)!.push(cs)
  }

  const rows: ProfitabilityRow[] = []

  for (const cc of countryCarriers) {
    const country = cc.country!
    const carrier = cc.carrier!
    const currency = country.currency as Currency

    const ccPrices = customerPrices.filter((p) => p.country_carrier_id === cc.id)
    const ccBasePrices = basePrices.filter((p) => p.country_carrier_id === cc.id)
    const returnPrice = returnPrices.find((p) => p.country_carrier_id === cc.id)
    const ccSurcharges = surcharges.filter((s) => s.country_carrier_id === cc.id)

    // Skip rows without any base price or any customer prices
    if (ccBasePrices.length === 0 || ccPrices.length === 0) continue

    // Helper: find best base price for a given (delivery_type, service_name) pair.
    // Priority: exact (dt, service) > shared (dt, null) > fully shared (null, null) > first
    function findBasePrice(deliveryType: string | null, serviceName: string | null) {
      const sn = serviceName ?? null
      return ccBasePrices.find((p) => p.delivery_type === deliveryType && (p.service_name ?? null) === sn)
        ?? ccBasePrices.find((p) => p.delivery_type === deliveryType && (p.service_name ?? null) === null)
        ?? ccBasePrices.find((p) => p.delivery_type === null && (p.service_name ?? null) === null)
        ?? ccBasePrices[0]
    }

    // Generate one row per customer price (service)
    for (const cPrice of ccPrices) {
      const basePrice = findBasePrice(cPrice.delivery_type, cPrice.service_name ?? null)

      // Convert base price to local currency if stored in a different currency
      const basePriceLocal = (basePrice.currency as Currency) === currency
        ? basePrice.base_price
        : toCZK(basePrice.base_price, basePrice.currency as Currency, rates) / rates[currency]

      // Compute surcharges — skip entirely if price already includes all surcharges
      const surchargesBreakdown: SurchargeBreakdown[] = []
      if (!basePrice.surcharges_included) {
        // Carrier-level: fuel and toll — with per-route override support.
        // If surcharges table has a record with same type: value=0 disables it,
        // value>0 replaces the carrier-level rate for this route.
        const carrierLevel = carrierSurchargeMap.get(carrier.id) ?? []
        for (const cs of carrierLevel) {
          const override = ccSurcharges.find(s => s.type === cs.type)
          if (override !== undefined) {
            // Per-route override exists
            if (override.value > 0) {
              let computed = 0
              if (override.is_percentage) {
                computed = basePriceLocal * (override.value / 100)
              } else {
                const srcCur = (override.currency ?? currency) as Currency
                computed = srcCur === currency
                  ? override.value
                  : toCZK(override.value, srcCur, rates) / rates[currency]
                if (override.is_per_kg) computed = computed * weightKg
              }
              surchargesBreakdown.push({
                type: cs.type as SurchargeType,
                label: SURCHARGE_TYPE_LABELS[cs.type as SurchargeType] ?? cs.type,
                value: override.value,
                is_percentage: override.is_percentage,
                currency: override.currency as Currency | null,
                computed_amount: computed,
              })
            }
            // value === 0: skip this type entirely
            continue
          }
          // No override: use carrier-level rate. Carrier-level flat / per-kg
          // surcharges (e.g. toll) are denominated in CZK, so convert to the
          // route's local currency before adding to the local-currency total —
          // otherwise non-CZK countries inflate it by the FX rate on display.
          let computed = 0
          if (cs.is_percentage) {
            computed = basePriceLocal * (cs.value / 100)
          } else {
            const localValue = toCZK(cs.value, 'CZK', rates) / rates[currency]
            computed = cs.is_per_kg ? localValue * weightKg : localValue
          }
          surchargesBreakdown.push({
            type: cs.type as SurchargeType,
            label: SURCHARGE_TYPE_LABELS[cs.type as SurchargeType] ?? cs.type,
            value: cs.value,
            is_percentage: cs.is_percentage,
            currency: null,
            computed_amount: computed,
          })
        }

        // Per-route: COD, address_delivery, etc. — fuel/toll already handled above
        for (const s of ccSurcharges) {
          if (s.type === 'fuel' || s.type === 'toll') continue
          let computed = 0
          if (s.is_percentage) {
            computed = basePriceLocal * (s.value / 100)
          } else {
            const srcCur = (s.currency ?? currency) as Currency
            computed = srcCur === currency
              ? s.value
              : toCZK(s.value, srcCur, rates) / rates[currency]
            if (s.is_per_kg) computed = computed * weightKg
          }
          surchargesBreakdown.push({
            type: s.type as SurchargeType,
            label: s.label ?? SURCHARGE_TYPE_LABELS[s.type as SurchargeType] ?? s.type,
            value: s.value,
            is_percentage: s.is_percentage,
            currency: s.currency as Currency | null,
            computed_amount: computed,
          })
        }
      }

      const surchargesTotal = surchargesBreakdown.reduce((sum, s) => sum + s.computed_amount, 0)
      const totalCarrierCost = basePriceLocal + surchargesTotal

      const vatRate = country.vat_rate ?? 0
      const customerPriceNet = cPrice.price / (1 + vatRate)
      const margin = customerPriceNet - totalCarrierCost
      const marginPct = customerPriceNet > 0 ? (margin / customerPriceNet) * 100 : 0

      rows.push({
        country,
        carrier,
        country_carrier_id: cc.id,
        service_name: cPrice.service_name ?? null,
        delivery_type: cPrice.delivery_type as DeliveryType,
        customer_price: cPrice.price,
        customer_price_czk: toCZK(cPrice.price, currency, rates),
        customer_price_net: customerPriceNet,
        customer_price_net_czk: toCZK(customerPriceNet, currency, rates),
        free_shipping_threshold: cPrice.free_shipping_threshold ?? null,
        carrier_base_price: basePriceLocal,
        carrier_base_price_czk: toCZK(basePrice.base_price, basePrice.currency as Currency, rates),
        surcharges_total: surchargesTotal,
        surcharges_total_czk: toCZK(surchargesTotal, currency, rates),
        surcharges_breakdown: surchargesBreakdown,
        total_carrier_cost: totalCarrierCost,
        total_carrier_cost_czk: toCZK(totalCarrierCost, currency, rates),
        margin,
        margin_czk: toCZK(margin, currency, rates),
        margin_pct: marginPct,
        currency,
        return_price: returnPrice?.price ?? null,
        return_price_czk: returnPrice ? toCZK(returnPrice.price, currency, rates) : null,
        contract_end: cc.contract_end ?? null,
      })
    }
  }

  // Sort by country code, then carrier name
  return rows.sort((a, b) => {
    if (a.country.code !== b.country.code) return a.country.code.localeCompare(b.country.code)
    return a.carrier.name.localeCompare(b.carrier.name)
  })
}

// ─── Dashboard stats ──────────────────────────────────────────────────────────

export async function getDashboardStats(matrix: ProfitabilityRow[]): Promise<DashboardStats> {
  const supabase = await createClient()

  const soon = new Date()
  soon.setDate(soon.getDate() + 90)
  const soonStr = soon.toISOString().split('T')[0]

  const { count: expiring } = await supabase
    .from('country_carriers')
    .select('*', { count: 'exact', head: true })
    .not('contract_end', 'is', null)
    .lte('contract_end', soonStr)
    .gte('contract_end', new Date().toISOString().split('T')[0])

  const uniqueCountries = new Set(matrix.map((r) => r.country.id))
  const uniqueCarriers  = new Set(matrix.map((r) => r.carrier.id))
  const positive = matrix.filter((r) => r.margin >= 0).length
  const negative = matrix.filter((r) => r.margin < 0).length
  const avgMargin = matrix.length > 0
    ? matrix.reduce((s, r) => s + r.margin_pct, 0) / matrix.length
    : 0

  return {
    total_countries: uniqueCountries.size,
    total_carriers: uniqueCarriers.size,
    avg_margin_pct: avgMargin,
    positive_margin_count: positive,
    negative_margin_count: negative,
    contracts_expiring_soon: expiring ?? 0,
    total_monthly_shipments: null, // filled from Balíkobot
  }
}
