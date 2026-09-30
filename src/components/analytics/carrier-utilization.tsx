'use client'

import { useMemo } from 'react'
import { FlagImage } from '@/components/ui/flag-image'
import { Badge } from '@/components/ui/badge'
import type { BalikobotShipmentStats, Country } from '@/types'

interface Props {
  // Already filtered to the selected period by the parent dashboard.
  shipmentStats: BalikobotShipmentStats[]
  countries: Country[]
}

export function CarrierUtilization({ shipmentStats }: Props) {
  // Group by country → carrier breakdown over the provided (period-filtered) stats.
  const countryData = useMemo(() => {
    const map = new Map<string, {
      country: Country
      total: number
      carriers: { carrier: NonNullable<BalikobotShipmentStats['carrier']>; count: number; pct: number }[]
    }>()

    for (const s of shipmentStats) {
      if (!s.country || !s.carrier) continue
      const entry = map.get(s.country.code) ?? {
        country: s.country,
        total: 0,
        carriers: [],
      }
      entry.total += s.shipment_count
      const existing = entry.carriers.find(c => c.carrier.id === s.carrier!.id)
      if (existing) {
        existing.count += s.shipment_count
      } else {
        entry.carriers.push({ carrier: s.carrier, count: s.shipment_count, pct: 0 })
      }
      map.set(s.country.code, entry)
    }

    // Calculate percentages and sort
    for (const entry of map.values()) {
      entry.carriers.sort((a, b) => b.count - a.count)
      for (const c of entry.carriers) {
        c.pct = entry.total > 0 ? (c.count / entry.total) * 100 : 0
      }
    }

    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [shipmentStats])

  const totalShipments = useMemo(
    () => countryData.reduce((s, c) => s + c.total, 0),
    [countryData],
  )

  if (shipmentStats.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-gray-400">
        Žádná data o zásilkách pro zvolené období.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Total for the selected period */}
      <div className="flex items-center justify-end">
        <span className="text-[11px] text-gray-400">
          Celkem <span className="font-bold text-gray-600">{totalShipments.toLocaleString('cs-CZ')}</span> zásilek
        </span>
      </div>

      {/* Country rows */}
      <div className="space-y-3">
        {countryData.map(({ country, total, carriers }) => {
          const countryPct = totalShipments > 0 ? (total / totalShipments) * 100 : 0
          return (
            <div key={country.code} className="rounded-lg border border-gray-100 bg-white p-3">
              {/* Country header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FlagImage code={country.code} />
                  <span className="text-xs font-bold text-gray-800">{country.name}</span>
                  <Badge variant="outline" className="text-[9px] font-medium px-1.5 py-0 h-4 bg-gray-50 border-gray-200 text-gray-500">
                    {countryPct.toFixed(0)}% celku
                  </Badge>
                </div>
                <span className="text-xs font-bold text-gray-700">{total.toLocaleString('cs-CZ')}</span>
              </div>

              {/* Stacked bar */}
              <div className="flex h-5 rounded-md overflow-hidden mb-2">
                {carriers.map(({ carrier, pct }) => (
                  <div
                    key={carrier.id}
                    className="h-full relative group transition-all"
                    style={{
                      width: `${Math.max(pct, 1)}%`,
                      backgroundColor: carrier.logo_color,
                    }}
                    title={`${carrier.name}: ${pct.toFixed(1)}%`}
                  >
                    {pct > 12 && (
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white drop-shadow-sm">
                        {pct.toFixed(0)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Carrier detail rows */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1">
                {carriers.map(({ carrier, count, pct }) => (
                  <div key={carrier.id} className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: carrier.logo_color }}
                    />
                    <span className="text-[11px] text-gray-600 truncate">{carrier.name}</span>
                    <span className="text-[10px] font-bold text-gray-800 ml-auto shrink-0">
                      {count.toLocaleString('cs-CZ')}
                    </span>
                    <span className="text-[9px] text-gray-400 w-8 text-right shrink-0">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
