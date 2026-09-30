'use client'

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { ProfitabilityRow } from '@/types'

interface Props {
  matrix: ProfitabilityRow[]
}

const CARRIER_COLORS: Record<string, string> = {
  PPL: '#E30613',
  GLS: '#009900',
  PACKETA: '#BA2228',
  SLOVENSKA_POSTA: '#F7941D',
  CESKA_POSTA: '#0077C8',
}

export function CostBreakdownChart({ matrix }: Props) {
  // Aggregate per carrier (avg across all countries)
  const chartData = useMemo(() => {
    const carrierAgg = new Map<string, { code: string; name: string; baseCzk: number; surCzk: number; count: number }>()

    for (const row of matrix) {
      const existing = carrierAgg.get(row.carrier.code) ?? {
        code: row.carrier.code,
        name: row.carrier.name,
        baseCzk: 0,
        surCzk: 0,
        count: 0,
      }
      existing.baseCzk += row.carrier_base_price_czk
      existing.surCzk += row.surcharges_total_czk
      existing.count++
      carrierAgg.set(row.carrier.code, existing)
    }

    return [...carrierAgg.values()]
      .map((c) => ({
        name: c.name,
        code: c.code,
        basePct: c.count > 0 ? (c.baseCzk / (c.baseCzk + c.surCzk)) * 100 : 100,
        surPct: c.count > 0 ? (c.surCzk / (c.baseCzk + c.surCzk)) * 100 : 0,
        avgBase: c.count > 0 ? c.baseCzk / c.count : 0,
        avgSur: c.count > 0 ? c.surCzk / c.count : 0,
        avgTotal: c.count > 0 ? (c.baseCzk + c.surCzk) / c.count : 0,
        routes: c.count,
      }))
      .sort((a, b) => b.avgTotal - a.avgTotal)
  }, [matrix])

  if (chartData.length === 0) {
    return <p className="text-center text-gray-400 text-sm py-8">Žádná data</p>
  }

  return (
    <div className="space-y-4">
      {chartData.map((c) => (
        <div key={c.code} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-gray-700">{c.name}</span>
            <span className="text-gray-400">prům. {c.avgTotal.toFixed(0)} Kč ({c.routes} tras)</span>
          </div>
          <div className="flex h-5 rounded-full overflow-hidden bg-gray-100">
            <div
              className="flex items-center justify-center text-[9px] font-semibold text-white"
              style={{
                width: `${c.basePct}%`,
                backgroundColor: CARRIER_COLORS[c.code] ?? '#6b7280',
              }}
            >
              {c.basePct > 15 ? `${c.avgBase.toFixed(0)} Kč` : ''}
            </div>
            {c.surPct > 0 && (
              <div
                className="flex items-center justify-center text-[9px] font-semibold"
                style={{
                  width: `${c.surPct}%`,
                  backgroundColor: '#fbbf24',
                  color: '#78350f',
                }}
              >
                {c.surPct > 10 ? `${c.avgSur.toFixed(0)} Kč` : ''}
              </div>
            )}
          </div>
          <div className="flex gap-3 text-[10px] text-gray-400">
            <span>Základ: {c.basePct.toFixed(0)}%</span>
            <span>Příplatky: {c.surPct.toFixed(0)}%</span>
          </div>
        </div>
      ))}
      <div className="flex gap-4 pt-2 text-[10px] text-gray-400">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-gray-500" /> Základ dopravce
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-amber-400" /> Příplatky (palivo, mýto, dobírka)
        </div>
      </div>
    </div>
  )
}
