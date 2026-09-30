import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role client for server-side route handlers.
 * Bypasses RLS — use only in trusted server contexts (API routes, cron jobs).
 * Falls back to anon key if SUPABASE_SERVICE_ROLE_KEY is not set.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
  )
}
