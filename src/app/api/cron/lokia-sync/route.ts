/**
 * Lokia WMS sync endpoint — incremental with DB cache.
 *
 * POST body (optional): { month?: string }  — e.g. "2026-03"
 *   If omitted, syncs the current month.
 *
 * GET: protected by CRON_SECRET if set. Syncs the current month.
 *
 * Each call:
 *   1. Authenticates to Lokia and lists all Finished Outcome documents in the month.
 *   2. Checks DB cache for already-fetched details.
 *   3. Fetches details only for uncached docs (up to BATCH_PER_RUN per call).
 *   4. Stores new results in lokia_document_detail_cache.
 *   5. Aggregates ALL cached docs for the month and writes balikobot_stats.
 *
 * Run multiple times until `remaining === 0` to fully populate the cache.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  authenticate,
  listFinishedOutcomes,
  getDocumentDetailsParallel,
} from '@/lib/lokia'
import { reaggregateMonth } from '@/lib/lokia-aggregate'

export const maxDuration = 300

/** Max new document details to fetch per sync run. */
const BATCH_PER_RUN = 500

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return {
    from: `${month}-01T00:00:00`,
    to: `${month}-${String(last).padStart(2, '0')}T23:59:59`,
  }
}

export async function POST(request: Request) {
  let month = currentMonth()
  try {
    const body = (await request.json()) as { month?: string }
    if (body.month) month = body.month
  } catch {
    /* empty body allowed */
  }
  return runSync(month)
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = new URL(request.url)
  return runSync(url.searchParams.get('month') ?? currentMonth())
}

async function runSync(month: string) {
  const started = Date.now()
  const { from, to } = monthRange(month)
  const supabase = createAdminClient()

  // ── 1. Authenticate ────────────────────────────────────────────────────────
  let token: string
  try {
    token = await authenticate()
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Auth failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }

  // ── 2. List documents for month ────────────────────────────────────────────
  let documents
  try {
    documents = await listFinishedOutcomes(token, from, to)
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `List failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }

  if (documents.length === 0) {
    return NextResponse.json({
      ok: true, month, documents: 0, cached: 0, newlyFetched: 0,
      rateLimited: 0, remaining: 0, upserts: 0, durationMs: Date.now() - started,
    })
  }

  const allNumbers = documents.map((d) => d.DocumentNumber)

  // ── 3. Check which docs are already in cache ───────────────────────────────
  // Batch the .in() query to avoid URL length limits with large document lists.
  const CACHE_CHECK_BATCH = 500
  const cachedNumbers: string[] = []
  for (let i = 0; i < allNumbers.length; i += CACHE_CHECK_BATCH) {
    const { data } = await supabase
      .from('lokia_document_detail_cache')
      .select('document_number')
      .in('document_number', allNumbers.slice(i, i + CACHE_CHECK_BATCH))
    if (data) cachedNumbers.push(...data.map((r) => r.document_number))
  }
  const cachedSet = new Set(cachedNumbers)
  const uncached = allNumbers.filter((n) => !cachedSet.has(n))
  const toBeFetched = uncached.slice(0, BATCH_PER_RUN)

  // ── 4. Fetch details for uncached batch ────────────────────────────────────
  let newlyFetched = 0
  let rateLimited = 0

  let upsertErrMsg: string | null = null

  if (toBeFetched.length > 0) {
    const { details, failures, rateLimitHit } = await getDocumentDetailsParallel(token, toBeFetched, 5)
    // When rate limited, remaining = everything not yet successfully fetched
    rateLimited = rateLimitHit
      ? uncached.length - cachedSet.size - details.length
      : failures

    // Persist successful fetches to cache
    if (details.length > 0) {
      const cacheRows = details.map((d) => {
        const pi = d.PackageInformation
        const dateStr = d.CompletedDate ?? d.CreatedDate
        const docMonth = dateStr ? dateStr.substring(0, 7) : month
        return {
          document_number: d.DocumentNumber,
          month: docMonth,
          carrier_code: pi?.CarrierCode ?? null,
          country_code: pi?.CountryCode ?? null,
          cod_price: pi?.CashOnDeliveryPrice ?? null,
          weight: pi?.Weight ?? null,
          price: pi?.Price ?? null,
          currency_code: pi?.CurrencyCode ?? null,
          service_type: pi?.ServiceType ?? null,
          branch_id: pi?.BranchId ?? null,
        }
      })

      const { error: upsertError } = await supabase
        .from('lokia_document_detail_cache')
        .upsert(cacheRows, { onConflict: 'document_number' })

      if (upsertError) {
        console.error('[lokia-sync] cache upsert failed:', upsertError)
        upsertErrMsg = upsertError.message
      } else {
        newlyFetched = details.length
      }
    }
  }

  // ── 5. Aggregate all cached docs for this month ────────────────────────────
  // Uses the branch + service maps (shared with the standalone sync script), so
  // Packeta sub-carriers (FAN vs Sameday, …) split out by BranchId.
  const agg = await reaggregateMonth(supabase, month)
  if (!agg.ok) {
    return NextResponse.json({ ok: false, error: agg.error ?? 'Aggregation failed' }, { status: 500 })
  }

  const cached = cachedSet.size + newlyFetched
  const remaining = allNumbers.length - cached

  return NextResponse.json({
    ok: true,
    month,
    documents: documents.length,
    cached,
    newlyFetched,
    rateLimited,
    remaining,
    upsertError: upsertErrMsg,
    _debug: {
      v: 5,
      batchPerRun: BATCH_PER_RUN,
      uncachedCount: uncached.length,
      toBeFetchedCount: toBeFetched.length,
      serviceRoleKeySet: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    aggregatedShipments: agg.shipments,
    upserts: agg.upserts,
    durationMs: Date.now() - started,
  })
}
