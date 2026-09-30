'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { CarrierSurcharge, Carrier } from '@/types'

interface Props {
  carrierSurcharges: CarrierSurcharge[]
  carriers: Carrier[]
}

function buildTimeline(surcharges: CarrierSurcharge[], carrierCodes: string[]) {
  const fuelRecords = surcharges.filter((s) => s.type === 'fuel' && s.is_percentage)

  const carrierTimelines = new Map<string, Map<string, number>>()
  for (const s of fuelRecords) {
    const code = s.carrier?.code
    if (!code || !carrierCodes.includes(code)) continue
    if (!carrierTimelines.has(code)) carrierTimelines.set(code, new Map())
    carrierTimelines.get(code)!.set(s.valid_from, s.value)
  }

  const allDates = new Set<string>()
  for (const tl of carrierTimelines.values()) for (const d of tl.keys()) allDates.add(d)
  const sortedDates = [...allDates].sort()

  const lastValues: Record<string, number> = {}
  return sortedDates.map((date) => {
    const point: Record<string, string | number> = { date, label: formatDate(date) }
    for (const code of carrierCodes) {
      const tl = carrierTimelines.get(code)
      if (tl?.has(date)) lastValues[code] = tl.get(date)!
      if (lastValues[code] != null) point[code] = lastValues[code]
    }
    return point
  })
}

function formatDate(d: string) {
  const [y, m] = d.split('-')
  const months = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
  return `${months[parseInt(m)]} ${y.slice(2)}`
}

const CARRIER_COLORS: Record<string, string> = {
  PPL: '#E30613',
  GLS: '#009900',
  PACKETA: '#BA2228',
  SLOVENSKA_POSTA: '#F7941D',
  CESKA_POSTA: '#0077C8',
  DPD: '#DC0032',
}

export function FuelSurchargeChart({ carrierSurcharges, carriers }: Props) {
  const carrierCodes = useMemo(
    () => carriers.map((c) => c.code).filter((code) =>
      carrierSurcharges.some((s) => s.type === 'fuel' && s.is_percentage && s.carrier?.code === code)
    ),
    [carrierSurcharges, carriers],
  )

  const data = useMemo(() => buildTimeline(carrierSurcharges, carrierCodes), [carrierSurcharges, carrierCodes])

  if (data.length === 0) {
    return <p className="text-center text-gray-400 text-sm py-8">Žádná historická data o palivovém příplatku</p>
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: '#6b7280' }}
          interval={Math.max(0, Math.floor(data.length / 12))}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#6b7280' }}
          tickFormatter={(v) => `${v}%`}
          domain={[0, 'auto']}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, name: any) => [`${value}%`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {carrierCodes.map((code) => (
          <Line
            key={code}
            type="stepAfter"
            dataKey={code}
            stroke={CARRIER_COLORS[code] ?? '#6b7280'}
            strokeWidth={2}
            dot={false}
            connectNulls
            name={carriers.find((c) => c.code === code)?.name ?? code}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
