/**
 * Backfill lokia_document_detail_cache.branch_id for already-cached Packeta
 * ("zasilkovna") documents — BranchId wasn't captured before migration 014.
 *
 * BranchId is only available from the per-document detail endpoint, so this
 * re-fetches each matching doc (rate-limited, resumable). After it finishes,
 * re-aggregate the affected months with:
 *   node scripts/lokia-sync.mjs <YYYY-MM> 0      # 0 = aggregate only, no fetch
 *
 * Usage: node scripts/lokia-backfill-branch.mjs [COUNTRY=RO] [MAX]
 *   COUNTRY  ISO code to scope to (e.g. RO), or ALL for every country.
 *   MAX      max docs to process this run (default: all).
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dir, '..', '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    if (!line.includes('=') || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (!process.env[line.slice(0, i).trim()]) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
}

const API_BASE = 'https://www.lokiawms-app.com/wms-erp'
const DELAY_MS = 450
const RATE_LIMIT_WAIT_MS = 65_000
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const COUNTRY = (process.argv[2] ?? 'RO').toUpperCase()
const MAX = process.argv[3] ? parseInt(process.argv[3], 10) : Infinity

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

async function fetchDetail(token, docNum) {
  const r = await fetch(`${API_BASE}/v3/documents/detail/${encodeURIComponent(docNum)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (r.status === 404) return null
  if (r.status === 429 || r.status === 425) return 'rate_limited'
  if (!r.ok) return null
  return r.json()
}

/** Flush pending {docNum → branchId} as grouped updates (one UPDATE per distinct branchId). */
async function flush(pending) {
  if (pending.size === 0) return
  const byBranch = new Map()
  for (const [doc, branch] of pending) {
    if (!byBranch.has(branch)) byBranch.set(branch, [])
    byBranch.get(branch).push(doc)
  }
  for (const [branch, docs] of byBranch) {
    for (let i = 0; i < docs.length; i += 200) {
      const { error } = await sb.from('lokia_document_detail_cache')
        .update({ branch_id: branch }).in('document_number', docs.slice(i, i + 200))
      if (error) { console.log(`\nUpdate error: ${error.message}`); process.exit(1) }
    }
  }
  pending.clear()
}

async function run() {
  console.log(`\nBranchId backfill — country: ${COUNTRY}, carrier: zasilkovna`)
  let token = await authenticate()
  console.log('Auth OK')

  // Collect all matching doc numbers (branch_id still null), paginated.
  const docs = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from('lokia_document_detail_cache')
      .select('document_number').eq('carrier_code', 'zasilkovna').is('branch_id', null)
      .order('document_number').range(from, from + 999)
    if (COUNTRY !== 'ALL') q = q.ilike('country_code', COUNTRY)
    const { data, error } = await q
    if (error) { console.log(`Query error: ${error.message}`); process.exit(1) }
    if (!data || data.length === 0) break
    docs.push(...data.map((r) => r.document_number))
    if (data.length < 1000) break
  }
  console.log(`Docs needing branch_id: ${docs.length}`)
  if (docs.length === 0) { console.log('Nothing to backfill.'); return }

  const limit = Math.min(docs.length, MAX)
  let done = 0
  const pending = new Map()

  for (let i = 0; i < limit; ) {
    const d = await fetchDetail(token, docs[i])
    if (d === 'rate_limited') {
      console.log(`\n⏳ Rate limited at ${i}/${limit}. Flushing ${pending.size}, waiting 65s…`)
      await flush(pending)
      await new Promise((r) => setTimeout(r, RATE_LIMIT_WAIT_MS))
      try { token = await authenticate() } catch {}
      continue // retry same doc
    }
    // Use '' sentinel when a (rare) doc has no BranchId, so it isn't re-fetched forever.
    pending.set(docs[i], d?.PackageInformation?.BranchId ?? '')
    done++
    i++
    if (pending.size >= 200) await flush(pending)
    if (i % 100 === 0) process.stdout.write(`\r${i}/${limit} processed, ${done} updated…`)
    await new Promise((r) => setTimeout(r, DELAY_MS))
  }
  await flush(pending)
  console.log(`\nBackfill complete. Updated ${done} docs.`)
  console.log('Next: re-aggregate affected months → node scripts/lokia-sync.mjs <YYYY-MM> 0')
}

run().catch((e) => { console.error(e); process.exit(1) })
