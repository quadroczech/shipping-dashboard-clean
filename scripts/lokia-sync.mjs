/**
 * Standalone Lokia sync script — runs locally with .env.local credentials.
 * Uses service role key → bypasses all RLS/GRANT issues.
 * Processes docs sequentially with 400ms delay to stay under Lokia rate limit.
 * On 429 rate-limit: waits 65s and retries the same doc (no skipping).
 *
 * Usage: node scripts/lokia-sync.mjs [YYYY-MM]
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { buildBranchResolver, buildServiceResolver, aggregateRows } from './lib/aggregate.mjs'

// Load .env.local if present (local dev), otherwise use process.env (CI/Vercel)
const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dir, '..', '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    if (!line.includes('=') || line.startsWith('#')) continue
    const i = line.indexOf('=')
    const key = line.slice(0, i).trim()
    const val = line.slice(i + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const API_BASE = 'https://www.lokiawms-app.com/wms-erp'
const DELAY_MS = 400           // 400ms between requests ≈ 150/min (under rate limit)
const RATE_LIMIT_WAIT_MS = 65_000  // pause 65s on 429, then retry same doc
const SAVE_EVERY = 50          // upsert to DB every N fetched docs

const sb = createClient(SUPABASE_URL, SERVICE_KEY)
const month = process.argv[2] ?? new Date().toISOString().slice(0, 7)
const MAX_FETCH = process.argv[3] ? parseInt(process.argv[3], 10) : Infinity

function monthRange(m) {
  const [y, mo] = m.split('-').map(Number)
  const last = new Date(y, mo, 0).getDate()
  return { from: `${m}-01T00:00:00`, to: `${m}-${String(last).padStart(2,'0')}T23:59:59` }
}

async function authenticate() {
  const body = new URLSearchParams({
    grant_type: 'password',
    username: process.env.LOKIA_API_USER,
    password: process.env.LOKIA_API_PASSWORD,
  })
  const r = await fetch(`${API_BASE}/v1/Authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const d = await r.json()
  if (!d.access_token) throw new Error(`Auth failed: ${d.error_description ?? d.error}`)
  return d.access_token
}

async function listAll(token, from, to) {
  const all = []
  let start = 0
  while (true) {
    const url = new URL(`${API_BASE}/v3/documents`)
    url.searchParams.set('types', 'Outcome')
    url.searchParams.set('states', 'Finished')
    url.searchParams.set('completedDateFrom', from)
    url.searchParams.set('completedDateTo', to)
    url.searchParams.set('start', start)
    url.searchParams.set('limit', 10000)

    let r
    for (let attempt = 1; attempt <= 5; attempt++) {
      r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
      if (r.ok) break
      const body = await r.text().catch(() => '')
      console.log(`List attempt ${attempt}/5 — status ${r.status}: ${body.slice(0, 200)}`)
      if (attempt < 5) await new Promise(res => setTimeout(res, attempt * 10_000))
    }
    if (!r.ok) throw new Error(`List failed after retries: ${r.status}`)

    const page = await r.json()
    all.push(...page)
    if (page.length < 10000) break
    start += 10000
  }
  return all
}

async function fetchDetail(token, docNum) {
  const r = await fetch(`${API_BASE}/v3/documents/detail/${encodeURIComponent(docNum)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  })
  if (r.status === 404) return null
  if (r.status === 429) return 'rate_limited'
  if (!r.ok) return null
  return r.json()
}

function toRow(d, fallbackMonth) {
  const pi = d.PackageInformation
  const dateStr = d.CompletedDate ?? d.CreatedDate
  return {
    document_number: d.DocumentNumber,
    month: dateStr ? dateStr.slice(0, 7) : fallbackMonth,
    carrier_code: pi?.CarrierCode ?? null,
    country_code: pi?.CountryCode ?? null,
    cod_price: pi?.CashOnDeliveryPrice ?? null,
    weight: pi?.Weight ?? null,
    price: pi?.Price ?? null,
    currency_code: pi?.CurrencyCode ?? null,
    service_type: pi?.ServiceType ?? null,
    branch_id: pi?.BranchId ?? null,
  }
}

async function upsertRows(rows) {
  // Deduplicate by document_number within the batch (Lokia can return dupes)
  const unique = [...new Map(rows.map(r => [r.document_number, r])).values()]
  const { error } = await sb.from('lokia_document_detail_cache')
    .upsert(unique, { onConflict: 'document_number' })
  if (error) { console.log(`\nUpsert error: ${error.message}`); process.exit(1) }
}

async function run() {
  console.log(`\nLokia sync — month: ${month}`)
  const { from, to } = monthRange(month)

  console.log('Authenticating…')
  let token = await authenticate()
  console.log('Auth OK')

  console.log('Listing documents…')
  const docs = await listAll(token, from, to)
  console.log(`Total documents: ${docs.length}`)

  // Check which are already cached (deduplicate listing — Lokia can return dupes)
  const allNums = [...new Set(docs.map(d => d.DocumentNumber))]
  const cachedNums = new Set()
  for (let i = 0; i < allNums.length; i += 500) {
    const { data } = await sb.from('lokia_document_detail_cache')
      .select('document_number').in('document_number', allNums.slice(i, i + 500))
    if (data) data.forEach(r => cachedNums.add(r.document_number))
  }
  const uncached = allNums.filter(n => !cachedNums.has(n))
  console.log(`Cached: ${cachedNums.size}, Uncached: ${uncached.length}`)

  if (uncached.length === 0) {
    console.log('All docs cached — running aggregation only.')
  } else {
    let totalFetched = 0
    let pending = []
    const fetchLimit = Math.min(uncached.length, MAX_FETCH)
    if (MAX_FETCH < uncached.length) console.log(`Fetch limit: ${MAX_FETCH} of ${uncached.length} uncached`)

    for (let i = 0; i < fetchLimit; ) {
      const docNum = uncached[i]

      const d = await fetchDetail(token, docNum)

      if (d === 'rate_limited') {
        console.log(`\n⏳ Rate limited at ${i}/${uncached.length}. Saving ${pending.length} pending, then waiting ${RATE_LIMIT_WAIT_MS/1000}s…`)
        if (pending.length > 0) { await upsertRows(pending); totalFetched += pending.length; pending = [] }
        await new Promise(r => setTimeout(r, RATE_LIMIT_WAIT_MS))
        try { token = await authenticate() } catch {}
        // Retry the same doc — do NOT increment i
        continue
      }

      if (d) pending.push(toRow(d, month))
      i++

      if (pending.length >= SAVE_EVERY) {
        await upsertRows(pending)
        totalFetched += pending.length
        pending = []
      }

      if (i % 100 === 0) process.stdout.write(`\r${i}/${uncached.length} fetched, ${totalFetched} saved…`)

      await new Promise(r => setTimeout(r, DELAY_MS))
    }

    if (pending.length > 0) { await upsertRows(pending); totalFetched += pending.length }
    const stillUncached = uncached.length - (cachedNums.size - 0) - totalFetched
    const remaining = uncached.length - fetchLimit
    console.log(`\nFetch complete. Newly fetched: ${totalFetched}${remaining > 0 ? `, remaining: ${remaining} — run again to continue` : ', all done'}`)
  }

  // Aggregate — query by document_number (not month) to avoid date format issues
  console.log('Aggregating…')
  const allCachedData = []
  for (let i = 0; i < allNums.length; i += 500) {
    const { data } = await sb.from('lokia_document_detail_cache')
      .select('document_number, carrier_code, country_code, cod_price, weight, price, currency_code, service_type, branch_id')
      .in('document_number', allNums.slice(i, i + 500))
    if (data) allCachedData.push(...data)
  }
  const allCached = allCachedData
  console.log(`Loaded ${allCached.length} cached docs for aggregation`)

  // Load resolvers: BranchId map (Packeta sub-carriers) → service map → CARRIER_MAP
  const { data: branchMapRows } = await sb.from('lokia_branch_map')
    .select('lokia_carrier_code, country_code, branch_id, is_prefix, carrier_code, delivery_type, last_mile_carrier')
  const { data: svcMapRows } = await sb.from('lokia_service_map')
    .select('lokia_carrier_code, lokia_service_type, country_code, carrier_code, delivery_type, last_mile_carrier')
  const resolveBranch = buildBranchResolver(branchMapRows)
  const resolveService = buildServiceResolver(svcMapRows)

  const { data: countries } = await sb.from('countries').select('id, code')
  const { data: carriers } = await sb.from('carriers').select('id, code')
  const countryMap = new Map(countries.map(c => [c.code.toUpperCase(), c.id]))
  const carrierMap = new Map(carriers.map(c => [c.code, c.id]))

  const { entries, unknownCarriers, noCountry, noInfo } = aggregateRows(allCached, { resolveBranch, resolveService })

  await sb.from('balikobot_stats').delete().eq('month', month)
  let upserts = 0
  for (const agg of entries.values()) {
    const countryId = countryMap.get(agg.countryCode)
    const carrierId = carrierMap.get(agg.carrier)
    if (!countryId || !carrierId) continue
    const { error } = await sb.from('balikobot_stats').insert({
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

  const total = [...entries.values()].reduce((s, a) => s + a.shipmentCount, 0)
  console.log(`Done. Stats written: ${upserts} rows, ${total} shipments aggregated.`)
  console.log(`No package info: ${noInfo}, No country: ${noCountry}, Unknown carriers:`, unknownCarriers)
}

run().catch(e => { console.error(e); process.exit(1) })
