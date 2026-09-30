'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { FlagImage } from '@/components/ui/flag-image'
import { CarrierBadge } from '@/components/ui/carrier-badge'
import { TrendingDown, TrendingUp, Minus, Fuel, ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProfitabilityRow, Carrier, BalikobotShipmentStats } from '@/types'

interface Props {
  matrix: ProfitabilityRow[]
  carriers: Carrier[]
  shipmentStats: BalikobotShipmentStats[]
}

// May 2026 fuel surcharge rates (pre-filled)
const MAY_2026_RATES: Record<string, number> = {
  PPL: 18.8,
  GLS: 15.5,
  SLOVENSKA_POSTA: 12,
  PACKETA: 17.5,
  DPD: 3,
}

type SimRow = ProfitabilityRow & {
  old_fuel_pct: number
  new_fuel_pct: number
  old_fuel_amount: number
  new_fuel_amount: number
  new_total_cost: number
  new_margin: number
  new_margin_pct: number
  margin_change: number
  price_increase_needed: number
  has_fuel_surcharge: boolean
  utilization_pct: number | null
}

function simulateRow(row: ProfitabilityRow, newFuelPct: number, utilizationPct: number | null): SimRow {
  const fuelItem = row.surcharges_breakdown.find((s) => s.type === 'fuel')
  const hasFuel = !!fuelItem
  const oldFuelAmount = fuelItem?.computed_amount ?? 0
  const oldFuelPct = fuelItem?.is_percentage ? fuelItem.value : 0

  // Only simulate fuel change if this route actually has a fuel surcharge
  const newFuelAmount = hasFuel ? row.carrier_base_price * (newFuelPct / 100) : 0
  const newTotalCost = row.total_carrier_cost - oldFuelAmount + newFuelAmount
  const newMargin = row.customer_price_net - newTotalCost
  const newMarginPct = row.customer_price_net > 0 ? (newMargin / row.customer_price_net) * 100 : 0
  const marginChange = newMarginPct - row.margin_pct

  // Price increase needed to maintain current margin %
  const maintainFactor = row.margin_pct >= 100 ? 0 : 1 - row.margin_pct / 100
  const requiredNet = maintainFactor > 0 ? newTotalCost / maintainFactor : newTotalCost
  const vatMult = 1 + (row.country.vat_rate ?? 0)
  const priceIncreaseNeeded = hasFuel ? Math.max(0, requiredNet * vatMult - row.customer_price) : 0

  return {
    ...row,
    old_fuel_pct: oldFuelPct,
    new_fuel_pct: newFuelPct,
    old_fuel_amount: oldFuelAmount,
    new_fuel_amount: newFuelAmount,
    new_total_cost: newTotalCost,
    new_margin: newMargin,
    new_margin_pct: newMarginPct,
    margin_change: marginChange,
    price_increase_needed: priceIncreaseNeeded,
    has_fuel_surcharge: hasFuel,
    utilization_pct: utilizationPct,
  }
}

type SortKey = 'country' | 'service' | 'utilization' | 'customer_price' | 'old_fuel' | 'new_fuel' | 'margin_old' | 'margin_new' | 'margin_change' | 'price_increase'
type SortDir = 'asc' | 'desc'

function sortRows(rows: SimRow[], key: SortKey, dir: SortDir): SimRow[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    let av: number | string, bv: number | string
    switch (key) {
      case 'country':       av = a.country.code;          bv = b.country.code; break
      case 'service':       av = a.service_name ?? '';    bv = b.service_name ?? ''; break
      case 'utilization':   av = a.utilization_pct ?? -1; bv = b.utilization_pct ?? -1; break
      case 'customer_price': av = a.customer_price;       bv = b.customer_price; break
      case 'old_fuel':      av = a.old_fuel_amount;       bv = b.old_fuel_amount; break
      case 'new_fuel':      av = a.new_fuel_amount;       bv = b.new_fuel_amount; break
      case 'margin_old':    av = a.margin_pct;            bv = b.margin_pct; break
      case 'margin_new':    av = a.new_margin_pct;        bv = b.new_margin_pct; break
      case 'margin_change': av = a.margin_change;         bv = b.margin_change; break
      case 'price_increase': av = a.price_increase_needed; bv = b.price_increase_needed; break
      default:              av = 0; bv = 0
    }
    if (typeof av === 'string') return av.localeCompare(bv as string) * mul
    return ((av as number) - (bv as number)) * mul
  })
}

function SortTh({ label, sortKey, current, dir, onSort, className }: {
  label: string
  sortKey: SortKey
  current: SortKey
  dir: SortDir
  onSort: (k: SortKey) => void
  className?: string
}) {
  const active = current === sortKey
  return (
    <th
      className={cn('px-4 py-2 font-medium text-gray-400 text-[10px] uppercase cursor-pointer select-none hover:text-gray-600 transition-colors', className)}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active
          ? dir === 'asc'
            ? <ChevronUp className="h-3 w-3 text-gray-500" />
            : <ChevronDown className="h-3 w-3 text-gray-500" />
          : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
      </span>
    </th>
  )
}

function MarginBadge({ pct, className }: { pct: number; className?: string }) {
  const isNeg = pct < 0
  const isLow = pct >= 0 && pct < 5
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] font-bold px-1.5 py-0 h-5',
        isNeg ? 'bg-red-100 border-red-200 text-red-700'
          : isLow ? 'bg-amber-100 border-amber-200 text-amber-700'
          : 'bg-green-50 border-green-200 text-green-700',
        className,
      )}
    >
      {pct.toFixed(1)}%
    </Badge>
  )
}

// Compute utilization per country+carrier from the last 3 available months
function buildUtilizationMap(stats: BalikobotShipmentStats[]): Map<string, number> {
  if (stats.length === 0) return new Map()

  const months = [...new Set(stats.map((s) => s.month))].sort().slice(-3)
  const recent = stats.filter((s) => months.includes(s.month))

  // Total shipments per country across all carriers
  const countryTotals = new Map<string, number>()
  for (const s of recent) {
    const cc = s.country?.code
    if (!cc) continue
    countryTotals.set(cc, (countryTotals.get(cc) ?? 0) + s.shipment_count)
  }

  // Shipments per country+carrier
  const ccTotals = new Map<string, number>()
  for (const s of recent) {
    const cc = s.country?.code
    const car = s.carrier?.code
    if (!cc || !car) continue
    const key = `${cc}__${car}`
    ccTotals.set(key, (ccTotals.get(key) ?? 0) + s.shipment_count)
  }

  const result = new Map<string, number>()
  for (const [key, count] of ccTotals) {
    const [cc] = key.split('__')
    const total = countryTotals.get(cc) ?? 0
    if (total > 0) result.set(key, (count / total) * 100)
  }
  return result
}

export function FuelSurchargeSimulator({ matrix, carriers, shipmentStats }: Props) {
  const activeCarriers = useMemo(() => {
    const codesInMatrix = new Set(matrix.map((r) => r.carrier.code))
    return carriers.filter((c) => codesInMatrix.has(c.code))
  }, [matrix, carriers])

  const [sortKey, setSortKey] = useState<SortKey>('utilization')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'country' || key === 'service' ? 'asc' : 'desc') }
  }

  const [newRates, setNewRates] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      activeCarriers.map((c) => [
        c.code,
        MAY_2026_RATES[c.code] != null ? String(MAY_2026_RATES[c.code]) : '',
      ])
    )
  )

  const oldRates = useMemo(() => {
    const map: Record<string, number> = {}
    for (const row of matrix) {
      const code = row.carrier.code
      if (map[code] != null) continue
      const fuel = row.surcharges_breakdown.find((s) => s.type === 'fuel' && s.is_percentage)
      if (fuel) map[code] = fuel.value
    }
    return map
  }, [matrix])

  const utilizationMap = useMemo(() => buildUtilizationMap(shipmentStats), [shipmentStats])

  const simulated = useMemo((): SimRow[] => {
    return matrix.map((row) => {
      const pct = parseFloat(newRates[row.carrier.code] ?? '0') || 0
      const key = `${row.country.code}__${row.carrier.code}`
      const utilPct = utilizationMap.get(key) ?? null
      return simulateRow(row, pct, utilPct)
    })
  }, [matrix, newRates, utilizationMap])

  const groups = useMemo(() => {
    const map = new Map<string, { carrier: Carrier; rows: SimRow[] }>()
    for (const row of simulated) {
      const code = row.carrier.code
      if (!map.has(code)) map.set(code, { carrier: row.carrier, rows: [] })
      map.get(code)!.rows.push(row)
    }
    return [...map.values()].sort((a, b) => a.carrier.name.localeCompare(b.carrier.name))
  }, [simulated])

  const summary = useMemo(() => {
    const withFuel = simulated.filter((r) => r.has_fuel_surcharge)
    const needsIncrease = withFuel.filter((r) => r.price_increase_needed > 0.01)
    const goNegative = withFuel.filter((r) => r.margin_pct >= 0 && r.new_margin_pct < 0)
    const avgOld = simulated.length > 0 ? simulated.reduce((s, r) => s + r.margin_pct, 0) / simulated.length : 0
    const avgNew = simulated.length > 0 ? simulated.reduce((s, r) => s + r.new_margin_pct, 0) / simulated.length : 0
    return { needsIncrease: needsIncrease.length, goNegative: goNegative.length, avgOld, avgNew }
  }, [simulated])

  return (
    <div className="space-y-4">
      {/* Carrier rate inputs */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 pt-3.5 px-4">
          <CardTitle className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-2">
            <div className="h-5 w-5 rounded-md bg-amber-50 flex items-center justify-center">
              <Fuel className="h-3 w-3 text-amber-500" />
            </div>
            Nové palivové sazby — platnost od 1. 5. 2026
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {activeCarriers.map((carrier) => {
              const oldPct = oldRates[carrier.code]
              const newVal = parseFloat(newRates[carrier.code] ?? '') || 0
              const diff = oldPct != null ? newVal - oldPct : null
              return (
                <div key={carrier.code} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 space-y-2">
                  <CarrierBadge carrier={carrier} size="sm" />
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={newRates[carrier.code] ?? ''}
                      onChange={(e) =>
                        setNewRates((prev) => ({ ...prev, [carrier.code]: e.target.value }))
                      }
                      className="h-7 text-sm font-semibold w-20 text-center"
                    />
                    <span className="text-xs text-gray-500">%</span>
                  </div>
                  <div className="text-[10px] text-gray-400 space-y-0.5">
                    {oldPct != null && (
                      <div>Duben: <span className="font-medium text-gray-600">{oldPct}%</span></div>
                    )}
                    {diff != null && (
                      <div className={cn(
                        'font-semibold',
                        diff > 0 ? 'text-red-500' : diff < 0 ? 'text-green-600' : 'text-gray-400'
                      )}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(1)} p.b.
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl bg-white border border-gray-100 p-4 shadow-sm">
          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Prům. marže nyní</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{summary.avgOld.toFixed(1)}%</p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-4 shadow-sm">
          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Prům. marže v květnu</p>
          <p className={cn('text-2xl font-black mt-1',
            summary.avgNew < summary.avgOld ? 'text-red-600' : 'text-green-600'
          )}>
            {summary.avgNew.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-4 shadow-sm">
          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Zdražení doporučeno</p>
          <p className={cn('text-2xl font-black mt-1', summary.needsIncrease > 0 ? 'text-amber-600' : 'text-green-600')}>
            {summary.needsIncrease}
          </p>
          <p className="text-[9px] text-gray-400 mt-0.5">tras</p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 p-4 shadow-sm">
          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Přejde do mínusu</p>
          <p className={cn('text-2xl font-black mt-1', summary.goNegative > 0 ? 'text-red-600' : 'text-green-600')}>
            {summary.goNegative}
          </p>
          <p className="text-[9px] text-gray-400 mt-0.5">tras</p>
        </div>
      </div>

      {/* Per-carrier tables */}
      {groups.map(({ carrier, rows }) => {
        const sorted = sortRows(rows, sortKey, sortDir)
        const oldPct = oldRates[carrier.code]
        const newPct = parseFloat(newRates[carrier.code] ?? '') || 0
        const diff = oldPct != null ? newPct - oldPct : null

        return (
          <Card key={carrier.code} className="border-0 shadow-sm">
            <CardHeader className="pb-1.5 pt-3.5 px-4">
              <div className="flex items-center gap-2">
                <CarrierBadge carrier={carrier} size="sm" />
                <span className="text-xs text-gray-500 font-medium">{rows.length} tras</span>
                {diff != null && (
                  <span className={cn(
                    'text-xs font-semibold ml-1',
                    diff > 0 ? 'text-red-500' : diff < 0 ? 'text-green-600' : 'text-gray-400'
                  )}>
                    {oldPct}% → {newPct}% ({diff > 0 ? '+' : ''}{diff.toFixed(1)} p.b.)
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <SortTh label="Země"            sortKey="country"        current={sortKey} dir={sortDir} onSort={handleSort} className="text-left" />
                      <SortTh label="Služba"          sortKey="service"        current={sortKey} dir={sortDir} onSort={handleSort} className="text-left" />
                      <SortTh label="Využití"         sortKey="utilization"    current={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />
                      <SortTh label="Cena zákazníka"  sortKey="customer_price" current={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />
                      <SortTh label="Palivo duben"    sortKey="old_fuel"       current={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />
                      <SortTh label="Palivo květen"   sortKey="new_fuel"       current={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />
                      <SortTh label="Marže nyní"      sortKey="margin_old"     current={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />
                      <SortTh label="Marže květen"    sortKey="margin_new"     current={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />
                      <SortTh label="Změna"           sortKey="margin_change"  current={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />
                      <SortTh label="Doporuč. zdražení" sortKey="price_increase" current={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((row) => {
                      const isNowNeg = row.new_margin_pct < 0
                      const isNowLow = row.new_margin_pct >= 0 && row.new_margin_pct < 5
                      const worsened = row.margin_change < -0.01
                      return (
                        <tr
                          key={`${row.country_carrier_id}-${row.service_name ?? ''}`}
                          className={cn(
                            'border-b border-gray-50 last:border-0',
                            !row.has_fuel_surcharge ? 'opacity-50'
                              : isNowNeg ? 'bg-red-50/40 hover:bg-red-50/70'
                              : isNowLow ? 'bg-amber-50/30 hover:bg-amber-50/60'
                              : 'hover:bg-gray-50',
                          )}
                        >
                          <td className="px-4 py-2.5 font-semibold text-gray-700">
                            <span className="flex items-center gap-1.5">
                              <FlagImage code={row.country.code} />
                              {row.country.code}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 max-w-[120px] truncate">
                            {row.service_name ?? '—'}
                          </td>
                          <td className="px-4 py-2.5">
                            {row.utilization_pct != null ? (
                              <div className="flex items-center gap-1.5 justify-end">
                                <div className="w-16 h-2 rounded-full bg-gray-100 overflow-hidden">
                                  <div
                                    className={cn(
                                      'h-full rounded-full transition-all',
                                      row.utilization_pct >= 40 ? 'bg-indigo-500'
                                        : row.utilization_pct >= 15 ? 'bg-indigo-400'
                                        : 'bg-indigo-200'
                                    )}
                                    style={{ width: `${Math.min(100, row.utilization_pct)}%` }}
                                  />
                                </div>
                                <span className={cn(
                                  'text-[10px] font-semibold tabular-nums w-7 text-right',
                                  row.utilization_pct >= 40 ? 'text-indigo-700'
                                    : row.utilization_pct >= 15 ? 'text-indigo-500'
                                    : 'text-gray-400'
                                )}>
                                  {row.utilization_pct.toFixed(0)}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-300 text-xs block text-right">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-600">
                            {row.customer_price.toFixed(2)} {row.currency}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-500">
                            {row.has_fuel_surcharge && row.old_fuel_amount > 0
                              ? `${row.old_fuel_amount.toFixed(2)} ${row.currency}`
                              : <span className="text-gray-300">v ceně</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-600">
                            {row.has_fuel_surcharge && row.new_fuel_amount > 0
                              ? `${row.new_fuel_amount.toFixed(2)} ${row.currency}`
                              : <span className="text-gray-300">v ceně</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <MarginBadge pct={row.margin_pct} />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <MarginBadge pct={row.new_margin_pct} />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {!row.has_fuel_surcharge ? (
                              <span className="text-gray-300 text-[10px]">není příplatek</span>
                            ) : worsened ? (
                              <span className="flex items-center justify-end gap-0.5 text-red-500 font-semibold">
                                <TrendingDown className="h-3 w-3" />
                                {row.margin_change.toFixed(1)} p.b.
                              </span>
                            ) : row.margin_change > 0.01 ? (
                              <span className="flex items-center justify-end gap-0.5 text-green-600 font-semibold">
                                <TrendingUp className="h-3 w-3" />
                                +{row.margin_change.toFixed(1)} p.b.
                              </span>
                            ) : (
                              <span className="flex items-center justify-end gap-0.5 text-gray-400">
                                <Minus className="h-3 w-3" />0
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {!row.has_fuel_surcharge ? (
                              <span className="text-gray-300">—</span>
                            ) : row.price_increase_needed > 0.01 ? (
                              <span className={cn('font-semibold', isNowNeg ? 'text-red-600' : 'text-amber-600')}>
                                +{row.price_increase_needed.toFixed(2)} {row.currency}
                              </span>
                            ) : (
                              <span className="text-green-500 font-medium">v pořádku</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
