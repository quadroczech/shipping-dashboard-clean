'use client'

import type { ProfitabilityRow } from '@/types'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface MarginChartProps {
  data: ProfitabilityRow[]
}

/**
 * Visual heatmap matrix: Country rows × Carrier columns
 * Each cell shows margin % with traffic-light color coding.
 * CEO can see all routes at a glance.
 */
export function MarginChart({ data }: MarginChartProps) {
  const [hoveredCell, setHoveredCell] = useState<string | null>(null)

  // Build matrix: country → carrier → best row
  const countries = [...new Set(data.map((r) => r.country.code))].sort()
  const carriers = [...new Set(data.map((r) => r.carrier.code))].sort()

  // Get carrier display names
  const carrierNames: Record<string, string> = {}
  data.forEach((r) => { carrierNames[r.carrier.code] = r.carrier.name })

  // Build lookup: best (or worst) margin per country-carrier
  const matrix: Record<string, Record<string, ProfitabilityRow>> = {}
  for (const row of data) {
    if (!matrix[row.country.code]) matrix[row.country.code] = {}
    const existing = matrix[row.country.code][row.carrier.code]
    // Keep the row with worst margin (most problematic)
    if (!existing || row.margin_pct < existing.margin_pct) {
      matrix[row.country.code][row.carrier.code] = row
    }
  }

  function getColor(pct: number): string {
    if (pct < -20) return 'bg-red-600 text-white'
    if (pct < 0) return 'bg-red-400 text-white'
    if (pct < 5) return 'bg-amber-400 text-amber-900'
    if (pct < 15) return 'bg-emerald-400 text-emerald-900'
    return 'bg-emerald-600 text-white'
  }

  const CARRIER_COLORS: Record<string, string> = {
    PPL: '#E30613',
    GLS: '#009900',
    PACKETA: '#BA2228',
    SLOVENSKA_POSTA: '#F7941D',
    CESKA_POSTA: '#0077C8',
    BALIKOVNA: '#E31E52',
  }

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex items-center gap-3 text-[9px] text-gray-400">
        <span className="font-medium uppercase tracking-wider">Marže %</span>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-red-600" />
          <span>&lt;-20%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-red-400" />
          <span>&lt;0%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-amber-400" />
          <span>0-5%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-emerald-400" />
          <span>5-15%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-emerald-600" />
          <span>&gt;15%</span>
        </div>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left text-[10px] font-medium text-gray-400 uppercase tracking-wider pb-2 pr-2 w-14">Země</th>
              {carriers.map((code) => (
                <th key={code} className="text-center pb-2 px-0.5">
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    {code === 'PACKETA' ? 'ZÁS' : code === 'SLOVENSKA_POSTA' ? 'SP' : code === 'CESKA_POSTA' ? 'ČP' : code}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {countries.map((countryCode) => (
              <tr key={countryCode}>
                <td className="pr-2 py-0.5">
                  <span className="text-xs font-bold text-gray-700">{countryCode}</span>
                </td>
                {carriers.map((carrierCode) => {
                  const row = matrix[countryCode]?.[carrierCode]
                  const cellKey = `${countryCode}-${carrierCode}`
                  const isHovered = hoveredCell === cellKey

                  if (!row) {
                    return (
                      <td key={carrierCode} className="px-0.5 py-0.5">
                        <div className="h-9 rounded-md bg-gray-50 flex items-center justify-center">
                          <span className="text-[9px] text-gray-300">—</span>
                        </div>
                      </td>
                    )
                  }

                  return (
                    <td key={carrierCode} className="px-0.5 py-0.5">
                      <div
                        className={cn(
                          'h-9 rounded-md flex items-center justify-center cursor-default transition-all relative',
                          getColor(row.margin_pct),
                          isHovered ? 'ring-2 ring-gray-900 ring-offset-1 z-10 scale-110' : ''
                        )}
                        onMouseEnter={() => setHoveredCell(cellKey)}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        <span className="text-[11px] font-black">{row.margin_pct.toFixed(0)}%</span>

                        {/* Tooltip */}
                        {isHovered && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-900 text-white rounded-lg px-3 py-2 text-[10px] whitespace-nowrap z-50 shadow-xl">
                            <div className="font-bold mb-1">{countryCode} / {carrierNames[carrierCode]}</div>
                            {row.service_name && <div className="text-gray-400 text-[9px] mb-1">{row.service_name}</div>}
                            <div className="flex gap-3">
                              <span>Zák: {row.customer_price_net.toFixed(2)} {row.currency}</span>
                              <span>Dopr: {row.total_carrier_cost.toFixed(2)} {row.currency}</span>
                            </div>
                            <div className="font-bold mt-0.5">
                              Marže: {row.margin.toFixed(2)} {row.currency} ({row.margin_pct.toFixed(1)}%)
                            </div>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45 -mt-1" />
                          </div>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
