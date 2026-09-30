import type { ProfitabilityRow, Currency } from '@/types'

export interface SimulationRow {
  row: ProfitabilityRow
  newCarrierCostCZK: number | null
  newCartPrice: number | null
  newMargin: number
  newMarginCZK: number
  newMarginPct: number
  annualVolume?: number
  annualImpactCZK?: number | null
}

/**
 * Export margin comparison to CSV.
 * Uses semicolon delimiter and BOM for Czech Excel compatibility.
 * @param onlyChanged - if true, only export rows where user changed something
 */
export function exportMarginCSV(
  simRows: SimulationRow[],
  rates: Record<Currency, number>,
  onlyChanged: boolean = true,
): void {
  const filtered = onlyChanged
    ? simRows.filter(s => s.newCarrierCostCZK !== null || s.newCartPrice !== null)
    : simRows

  if (filtered.length === 0) return

  const headers = [
    'Země',
    'Dopravce',
    'Typ doručení',
    'Služba',
    'Měna',
    'Náklad dopravce CZK (původní)',
    'Náklad dopravce CZK (nový)',
    'Změna nákladu CZK',
    'Náklad dopravce místní (původní)',
    'Náklad dopravce místní (nový)',
    'Cena v košíku s DPH (původní)',
    'Cena v košíku s DPH (nová)',
    'Změna ceny košíku',
    'Marže CZK (původní)',
    'Marže CZK (nová)',
    'Marže místní (původní)',
    'Marže místní (nová)',
    'Změna marže místní',
    'Marže % (původní)',
    'Marže % (nová)',
    'Změna marže % (p.b.)',
    'Zásilky 12m',
    'Roční dopad CZK',
  ]

  const rows = filtered.map(({ row, newCarrierCostCZK, newCartPrice, newMargin, newMarginCZK, newMarginPct, annualVolume, annualImpactCZK }) => {
    const rate = rates[row.currency] ?? 1
    const carrierCostCZKOld = row.total_carrier_cost_czk
    const carrierCostCZKNew = newCarrierCostCZK ?? row.total_carrier_cost_czk
    const carrierCostLocalOld = row.total_carrier_cost
    const carrierCostLocalNew = newCarrierCostCZK != null ? newCarrierCostCZK / rate : row.total_carrier_cost
    const cartPriceOld = row.customer_price
    const cartPriceNew = newCartPrice ?? row.customer_price

    return [
      row.country.code,
      row.carrier.name,
      row.delivery_type === 'home' ? 'Domů' : row.delivery_type === 'pickup' ? 'Výdejní místo' : '—',
      row.service_name ?? '',
      row.currency,
      fmt(carrierCostCZKOld),
      fmt(carrierCostCZKNew),
      fmt(carrierCostCZKNew - carrierCostCZKOld),
      fmt(carrierCostLocalOld),
      fmt(carrierCostLocalNew),
      fmt(cartPriceOld),
      fmt(cartPriceNew),
      fmt(cartPriceNew - cartPriceOld),
      fmt(row.margin_czk),
      fmt(newMarginCZK),
      fmt(row.margin),
      fmt(newMargin),
      fmt(newMargin - row.margin),
      fmt(row.margin_pct),
      fmt(newMarginPct),
      fmt(newMarginPct - row.margin_pct),
      String(annualVolume ?? ''),
      annualImpactCZK != null ? fmt(annualImpactCZK) : '',
    ]
  })

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n')

  // BOM + content for Excel
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date().toISOString().split('T')[0]
  a.href = url
  a.download = `marze-simulace-${date}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',')
}
