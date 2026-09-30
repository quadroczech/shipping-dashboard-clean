import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as XLSX from 'xlsx'

interface WeightBandRow {
  carrier_code: string
  country_code: string
  band_2kg: number
  band_5kg: number
  band_10kg: number
  band_20kg: number
  band_31kg: number
}

const CARRIER_ORDER = ['PPL', 'GLS', 'PACKETA', 'SLOVENSKA_POSTA', 'CESKA_POSTA', 'DPD']

const BAND_HEADERS = ['≤2kg', '2–5kg', '5–10kg', '10–20kg', '20–31,5kg']

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const supabase = createAdminClient()

  const [rpcResult, carriersResult] = await Promise.all([
    supabase.rpc('get_shipments_by_weight_band'),
    supabase.from('carriers').select('code, name'),
  ])

  const rows = rpcResult.data as WeightBandRow[] | null
  const error = rpcResult.error
  const carriers = carriersResult.data

  if (error || !rows) {
    console.error(error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // Group rows by carrier_code
  const byCarrier = new Map<string, WeightBandRow[]>()
  for (const row of rows) {
    const code = row.carrier_code.toUpperCase()
    if (!byCarrier.has(code)) byCarrier.set(code, [])
    byCarrier.get(code)!.push(row)
  }

  const wb = XLSX.utils.book_new()

  // Include every carrier that has data, ordered by CARRIER_ORDER first, then alphabetically
  const allCodes = [...new Set(rows.map(r => r.carrier_code.toUpperCase()))]
  const orderedCodes = [
    ...CARRIER_ORDER.filter(c => allCodes.includes(c)),
    ...allCodes.filter(c => !CARRIER_ORDER.includes(c)).sort(),
  ]

  for (const carrierCode of orderedCodes) {
    const carrierRows = byCarrier.get(carrierCode) ?? []
    const carrierName = carriers?.find(c => c.code === carrierCode)?.name ?? carrierCode

    // Collect all countries for this carrier, sorted
    const countries = [...new Set(carrierRows.map(r => r.country_code.toUpperCase()))].sort()

    // Total across all countries
    const total = {
      band_2kg:  carrierRows.reduce((s, r) => s + Number(r.band_2kg),  0),
      band_5kg:  carrierRows.reduce((s, r) => s + Number(r.band_5kg),  0),
      band_10kg: carrierRows.reduce((s, r) => s + Number(r.band_10kg), 0),
      band_20kg: carrierRows.reduce((s, r) => s + Number(r.band_20kg), 0),
      band_31kg: carrierRows.reduce((s, r) => s + Number(r.band_31kg), 0),
    }

    const wsData: (string | number)[][] = [
      // Row 1: column headers
      ['', ...BAND_HEADERS],
      // Row 2: carrier name
      ['company', carrierName, '', '', '', ''],
      // Row 3: total shipment count per band
      ['# zásilek', total.band_2kg, total.band_5kg, total.band_10kg, total.band_20kg, total.band_31kg],
    ]

    // One row per country
    for (const country of countries) {
      const r = carrierRows.find(row => row.country_code.toUpperCase() === country)
      if (r) {
        wsData.push([country, Number(r.band_2kg), Number(r.band_5kg), Number(r.band_10kg), Number(r.band_20kg), Number(r.band_31kg)])
      }
    }

    // Fixed metadata rows
    wsData.push(
      ['Co řádek to market.', '', '', '', '', ''],
      ['COT', '22:00', '22:00', '22:00', '22:00', '22:00'],
      ['Svoz', 'Kontejnerem', '', '', '', ''],
      ['Další specifika', '', '', '', '', ''],
    )

    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Column widths
    ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }]

    // Sheet name max 31 chars
    const sheetName = carrierName.slice(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  // xlsx write returns Uint8Array; copy into a plain ArrayBuffer to satisfy BodyInit types
  const raw = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as unknown as number[]
  const ab = new Uint8Array(raw).buffer as ArrayBuffer

  return new NextResponse(ab, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="zasilky-dle-vahy-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}
