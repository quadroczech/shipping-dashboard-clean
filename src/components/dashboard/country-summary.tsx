'use client'

import type { ProfitabilityRow } from '@/types'
import { FlagImage } from '@/components/ui/flag-image'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/constants'
import type { Currency } from '@/types'

interface Props {
  data: ProfitabilityRow[]
}

/**
 * Compact country summary cards — one per country with key metrics.
 * Shows: avg margin, # carriers, best/worst route, total customer price range.
 */
export function CountrySummary({ data }: Props) {
  // Group by country
  const countries = new Map<string, ProfitabilityRow[]>()
  for (const row of data) {
    const arr = countries.get(row.country.code) ?? []
    arr.push(row)
    countries.set(row.country.code, arr)
  }

  const sorted = [...countries.entries()].sort((a, b) => {
    const avgA = a[1].reduce((s, r) => s + r.margin_pct, 0) / a[1].length
    const avgB = b[1].reduce((s, r) => s + r.margin_pct, 0) / b[1].length
    return avgA - avgB // worst first
  })

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
      {sorted.map(([code, rows]) => {
        const avgMargin = rows.reduce((s, r) => s + r.margin_pct, 0) / rows.length
        const worst = rows.reduce((a, b) => a.margin_pct < b.margin_pct ? a : b)
        const best = rows.reduce((a, b) => a.margin_pct > b.margin_pct ? a : b)
        const carriers = new Set(rows.map((r) => r.carrier.code)).size
        const negative = rows.filter((r) => r.margin_pct < 0).length

        const isHealthy = avgMargin >= 5
        const isWarning = avgMargin >= 0 && avgMargin < 5
        const isDanger = avgMargin < 0

        return (
          <div
            key={code}
            className={cn(
              'rounded-xl p-3 border transition-shadow hover:shadow-md',
              isDanger ? 'border-red-200 bg-red-50/50' :
              isWarning ? 'border-amber-200 bg-amber-50/30' :
              'border-green-200 bg-green-50/30'
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <FlagImage code={code} />
                <span className="text-xs font-black text-gray-800">{code}</span>
              </div>
              <span className={cn(
                'text-sm font-black',
                isDanger ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-emerald-600'
              )}>
                {avgMargin.toFixed(0)}%
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[9px]">
                <span className="text-gray-400">{carriers} doprav.</span>
                {negative > 0 && (
                  <span className="text-red-500 font-bold">{negative} ztrát.</span>
                )}
              </div>

              {/* Mini bar showing best/worst */}
              <div className="flex h-1 rounded-full overflow-hidden bg-gray-200 gap-px">
                {rows
                  .sort((a, b) => a.margin_pct - b.margin_pct)
                  .map((r, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex-1 rounded-full',
                        r.margin_pct < 0 ? 'bg-red-400' :
                        r.margin_pct < 5 ? 'bg-amber-400' :
                        'bg-emerald-400'
                      )}
                    />
                  ))}
              </div>

              <div className="text-[8px] text-gray-400 flex justify-between">
                <span>{worst.carrier.code} {worst.margin_pct.toFixed(0)}%</span>
                <span>{best.carrier.code} {best.margin_pct.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
