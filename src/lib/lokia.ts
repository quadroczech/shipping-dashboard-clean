/**
 * LOKiA WMS API client
 * Docs: https://www.lokiawms-app.com/wms-erp/swagger/ui/index
 * Auth: OAuth2 password grant → Bearer token (~2h validity)
 */

const API_BASE = 'https://www.lokiawms-app.com/wms-erp'

// Map Lokia CarrierCode (from PackageInformation) to our internal carrier codes.
// The values must match carriers.code in the DB.
export const LOKIA_CARRIER_MAP: Record<string, string> = {
  ppl: 'PPL',
  gls: 'GLS',
  zasilkovna: 'PACKETA',
  sp: 'SLOVENSKA_POSTA',
  cp: 'CESKA_POSTA',
  // Additional carriers observed in Lokia data can be added here as they
  // are introduced in our `carriers` table.
  // dhlparcel: 'DHL',
}

// ─── Auth ────────────────────────────────────────────────────────────────────

interface AuthResponse {
  access_token?: string
  token_type?: string
  expires_in?: number
  error?: string
  error_description?: string
}

export async function authenticate(): Promise<string> {
  const user = process.env.LOKIA_API_USER
  const pass = process.env.LOKIA_API_PASSWORD
  if (!user || !pass) throw new Error('Missing LOKIA_API_USER or LOKIA_API_PASSWORD')

  const body = new URLSearchParams({
    grant_type: 'password',
    username: user,
    password: pass,
  })

  const res = await fetch(`${API_BASE}/v1/Authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    cache: 'no-store',
  })
  const data = (await res.json()) as AuthResponse
  if (!data.access_token) {
    throw new Error(`Lokia auth failed: ${data.error_description ?? data.error ?? 'unknown'}`)
  }
  return data.access_token
}

// ─── Documents ───────────────────────────────────────────────────────────────

export interface DocumentBase {
  Id: number
  DocumentNumber: string
  ExternalDocumentNumber: string
  Type: string
  State: string
  CreatedDate: string
}

export interface PackageInformation {
  CarrierCode: string | null
  CountryCode: string | null
  CashOnDeliveryPrice: number | null
  Weight: number | null
  CurrencyCode: string | null
  Price: number | null
  ServiceType: string | null
  // Packeta routing id — distinguishes the real last-mile carrier (e.g. RO:
  // 762 = FAN Courier, 7455-* = Sameday). Mapped via lokia_branch_map.
  BranchId: string | null
}

export interface DocumentDetail {
  Id: number
  DocumentNumber: string
  ExternalDocumentNumber: string
  Type: string
  State: string
  OrderTypeCode: string | null
  CompletedDate: string | null
  CreatedDate: string
  PackageInformation: PackageInformation | null
}

/**
 * List finished Outcome documents in a date range.
 * Uses completedDateFrom/completedDateTo to filter by when documents were
 * actually finished (not created), matching the month we're aggregating.
 * The API caps each page at 10000 rows; we paginate if necessary.
 */
export async function listFinishedOutcomes(
  token: string,
  fromDate: string,
  toDate: string,
): Promise<DocumentBase[]> {
  const all: DocumentBase[] = []
  const pageSize = 10000
  let start = 0

  // Safety cap: never fetch more than ~100k documents in a single call.
  const hardLimit = 100000

  while (start < hardLimit) {
    const url = new URL(`${API_BASE}/v3/documents`)
    url.searchParams.set('types', 'Outcome')
    url.searchParams.set('states', 'Finished')
    url.searchParams.set('completedDateFrom', fromDate)
    url.searchParams.set('completedDateTo', toDate)
    url.searchParams.set('start', String(start))
    url.searchParams.set('limit', String(pageSize))

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Lokia list failed: ${res.status} ${res.statusText}`)
    const page = (await res.json()) as DocumentBase[]
    all.push(...page)
    if (page.length < pageSize) break
    start += pageSize
  }

  return all
}

/**
 * Fetch detail for a single document by DocumentNumber.
 * Returns 'rate_limited' on 429 (caller should stop the batch).
 * Retries up to 2x on transient 5xx/network errors only.
 * Returns null on 404 or unrecoverable errors.
 */
export async function getDocumentDetail(
  token: string,
  documentNumber: string,
): Promise<DocumentDetail | 'rate_limited' | null> {
  let attempt = 0
  while (attempt < 2) {
    attempt++
    try {
      const res = await fetch(
        `${API_BASE}/v3/documents/detail/${encodeURIComponent(documentNumber)}`,
        {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          cache: 'no-store',
        },
      )
      if (res.status === 404) return null
      if (res.ok) return (await res.json()) as DocumentDetail
      if (res.status === 429) return 'rate_limited'
      if (res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1000 * attempt))
        continue
      }
      return null
    } catch {
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
  return null
}

/**
 * Fetch details for a list of documents with bounded concurrency.
 * Stops all workers as soon as the first 429 rate-limit is encountered.
 * Returns successful details, count of hard failures, and whether rate limit was hit.
 */
export async function getDocumentDetailsParallel(
  token: string,
  documentNumbers: string[],
  concurrency: number = 10,
): Promise<{ details: DocumentDetail[]; failures: number; rateLimitHit: boolean }> {
  const results: DocumentDetail[] = []
  let failures = 0
  let rateLimitHit = false
  let index = 0

  async function worker() {
    while (index < documentNumbers.length && !rateLimitHit) {
      const i = index++
      const detail = await getDocumentDetail(token, documentNumbers[i])
      if (detail === 'rate_limited') {
        rateLimitHit = true
        break
      }
      if (detail) results.push(detail)
      else failures++
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, documentNumbers.length) }, worker)
  await Promise.all(workers)
  return { details: results, failures, rateLimitHit }
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

export interface MonthlyAggregate {
  month: string                 // YYYY-MM
  countryCode: string           // CZ, SK, DE, …
  carrierCode: string           // our internal code: PPL, GLS, …
  shipmentCount: number
  codCount: number
  weightSum: number
  weightCount: number           // how many docs contributed to weightSum
}

export interface AggregationResult {
  aggregates: MonthlyAggregate[]
  noPackageInfo: number          // docs without PackageInformation
  unknownCarriers: Record<string, number>  // raw carrier code → count
  noCountry: number
  noDate: number
}

export function aggregateByMonthCountryCarrier(
  details: DocumentDetail[],
): AggregationResult {
  const map = new Map<string, MonthlyAggregate>()
  const unknownCarriers: Record<string, number> = {}
  let noPackageInfo = 0
  let noCountry = 0
  let noDate = 0

  for (const d of details) {
    const pi = d.PackageInformation
    if (!pi) { noPackageInfo++; continue }
    const carrierRaw = (pi.CarrierCode ?? '').toLowerCase()
    const countryCode = (pi.CountryCode ?? '').toUpperCase()
    const internalCarrier = LOKIA_CARRIER_MAP[carrierRaw]
    if (!countryCode) { noCountry++; continue }
    if (!internalCarrier) {
      unknownCarriers[carrierRaw || '(empty)'] = (unknownCarriers[carrierRaw || '(empty)'] ?? 0) + 1
      continue
    }

    // Month derived from CompletedDate (or CreatedDate as fallback)
    const dateStr = d.CompletedDate ?? d.CreatedDate
    if (!dateStr) { noDate++; continue }
    const month = dateStr.substring(0, 7)

    const key = `${month}__${countryCode}__${internalCarrier}`
    const entry = map.get(key) ?? {
      month,
      countryCode,
      carrierCode: internalCarrier,
      shipmentCount: 0,
      codCount: 0,
      weightSum: 0,
      weightCount: 0,
    }

    entry.shipmentCount += 1
    if (pi.CashOnDeliveryPrice && pi.CashOnDeliveryPrice > 0) entry.codCount += 1
    if (pi.Weight && pi.Weight > 0) {
      entry.weightSum += pi.Weight
      entry.weightCount += 1
    }
    map.set(key, entry)
  }

  return { aggregates: [...map.values()], noPackageInfo, unknownCarriers, noCountry, noDate }
}
