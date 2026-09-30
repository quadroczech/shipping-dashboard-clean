/**
 * Cron endpoint: Fetch latest exchange rates from ČNB and upsert into DB.
 * Call daily via Vercel Cron or manually: GET /api/cron/exchange-rates
 *
 * ČNB API returns pipe-delimited text with format:
 *   země|měna|množství|kód|kurz
 *   EMU|euro|1|EUR|24,365
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Currencies we care about
const TRACKED_CURRENCIES = ['EUR', 'CHF', 'GBP', 'HUF', 'PLN', 'RON', 'DKK', 'SEK']

export async function GET(request: Request) {
  // Optional: verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch today's rates from ČNB
    const cnbUrl = 'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt'
    const response = await fetch(cnbUrl, { cache: 'no-store' })
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch ČNB rates' }, { status: 502 })
    }

    const text = await response.text()
    const lines = text.trim().split('\n')

    // First line is date: "10.04.2026 #69"
    const dateLine = lines[0]
    const dateMatch = dateLine.match(/(\d{2})\.(\d{2})\.(\d{4})/)
    if (!dateMatch) {
      return NextResponse.json({ error: 'Cannot parse date from ČNB response' }, { status: 500 })
    }
    const rateDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`

    // Skip header line (index 1), parse data lines (index 2+)
    const rates: { from_currency: string; to_currency: string; rate: number; date: string }[] = []

    for (let i = 2; i < lines.length; i++) {
      const parts = lines[i].split('|')
      if (parts.length < 5) continue

      const quantity = parseInt(parts[2], 10)
      const code = parts[3].trim()
      const rateStr = parts[4].replace(',', '.')
      const rawRate = parseFloat(rateStr)

      if (!TRACKED_CURRENCIES.includes(code)) continue
      if (isNaN(rawRate) || isNaN(quantity) || quantity === 0) continue

      // ČNB gives rate per `quantity` units, normalize to rate per 1 unit
      const ratePerUnit = rawRate / quantity

      rates.push({
        from_currency: code,
        to_currency: 'CZK',
        rate: parseFloat(ratePerUnit.toFixed(6)),
        date: rateDate,
      })
    }

    if (rates.length === 0) {
      return NextResponse.json({ error: 'No rates parsed' }, { status: 500 })
    }

    // Upsert into DB (delete old rates for this date, then insert)
    const supabase = await createClient()

    // Delete existing rates for this date
    await supabase
      .from('exchange_rates')
      .delete()
      .eq('date', rateDate)

    // Insert new rates
    const { error } = await supabase
      .from('exchange_rates')
      .insert(rates)

    if (error) {
      console.error('DB insert error:', error)
      return NextResponse.json({ error: 'Database error', details: error.message }, { status: 500 })
    }

    // Also ensure CZK→CZK = 1 exists
    await supabase
      .from('exchange_rates')
      .upsert(
        { from_currency: 'CZK', to_currency: 'CZK', rate: 1, date: rateDate },
        { onConflict: 'from_currency,to_currency,date' }
      )

    return NextResponse.json({
      ok: true,
      date: rateDate,
      rates_updated: rates.length,
      rates: rates.map((r) => `${r.from_currency}: ${r.rate}`),
    })
  } catch (err) {
    console.error('Exchange rate sync error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
