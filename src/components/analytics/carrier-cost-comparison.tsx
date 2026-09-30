'use client'

import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
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

export function CarrierCostComparison({ matrix }: Props) {
  // Get unique countries that have more than 1 carrier
  const countriesWithMultiple = useMemo(() => {
    const countryCarriers = new Map<string, Set<string>>()
    for (const row of matrix) {
      const set = countryCarriers.get(row.country.code) ?? new Set()
      set.add(row.carrier.code)
      countryCarriers.set(row.country.code, set)
    }
    return [...countryCarriers.entries()]
      .filter(([, carriers]) => carriers.size > 1)
      .map(([code]) => code)
      .sort()
  }, [matrix])

  const [selectedCountry, setSelectedCountry] = useState(countriesWithMultiple[0] ?? 'CZ')

  const chartData = useMemo(() => {
    return matrix
      .filter((r) => r.country.code === selectedCountry)
      .sort((a, b) => a.total_carrier_cost_czk - b.total_carrier_cost_czk)
      .map((r) => ({
        label: `${r.carrier.code}${r.service_name ? ` ${r.service_name}` : ''}`,
        carrierCode: r.carrier.code,
        base: parseFloat(r.carrier_base_price_czk.toFixed(2)),
        surcharges: parseFloat(r.surcharges_total_czk.toFixed(2)),
        total: parseFloat(r.total_carrier_cost_czk.toFixed(2)),
      }))
  }, [matrix, selectedCountry])

  if (countriesWithMultiple.length === 0) {
    return <p className="text-center text-gray-400 text-sm py-8">Nedostatek dat pro srovnání</p>
  }

  return (
    <div>
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {countriesWithMultiple.map((code) => (
          <button
            key={code}
            onClick={() => setSelectedCountry(code)}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
              selectedCountry === code
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {code}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickFormatter={(v) => `${v} Kč`}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={100}
            tick={{ fontSize: 10, fill: '#6b7280' }}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any, name: any) => [`${Number(value).toFixed(2)} Kč`, name === 'base' ? 'Základ' : 'Příplatky']}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === 'base' ? 'Základ' : 'Příplatky'} />
          <Bar dataKey="base" stackId="cost" fill="#60a5fa" radius={[0, 0, 0, 0]} />
          <Bar dataKey="surcharges" stackId="cost" fill="#fbbf24" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
