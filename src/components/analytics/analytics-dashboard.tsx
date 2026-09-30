'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CarrierBadge } from '@/components/ui/carrier-badge'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FuelSurchargeChart } from './fuel-surcharge-chart'
import { FuelSurchargeSimulator } from './fuel-surcharge-simulator'
import { CarrierCostComparison } from './carrier-cost-comparison'
import { CostBreakdownChart } from './cost-breakdown-chart'
import { CarrierUtilization } from './carrier-utilization'
import { TrendingDown, TrendingUp, Scale, Fuel, BarChart3, Layers, PieChart } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProfitabilityRow, CarrierSurcharge, BalikobotShipmentStats, Carrier, Country } from '@/types'

interface Props {
  matrix: ProfitabilityRow[]
  carrierSurcharges: CarrierSurcharge[]
  shipmentStats: BalikobotShipmentStats[]
  carriers: Carrier[]
  countries: Country[]
}

const MONTH_NAMES = ['', 'leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']
function formatMonth(m: string) {
  if (!m) return ''
  const [y, mo] = m.split('-')
  return `${MONTH_NAMES[parseInt(mo)]} ${y}`
}

export function AnalyticsDashboard({ matrix, carrierSurcharges, shipmentStats, carriers, countries }: Props) {
  const kpis = useMemo(() => {
    if (matrix.length === 0) return null

    const margins = matrix.map((r) => r.margin_pct)
    const avgMargin = margins.reduce((a, b) => a + b, 0) / margins.length
    const worstRoute = matrix.reduce((a, b) => (a.margin_pct < b.margin_pct ? a : b))
    const bestRoute = matrix.reduce((a, b) => (a.margin_pct > b.margin_pct ? a : b))
    const negativeCount = matrix.filter((r) => r.margin_pct < 0).length

    const fuelSurcharges = carrierSurcharges.filter((s) => s.type === 'fuel' && s.is_percentage)
    const avgFuel = fuelSurcharges.length > 0
      ? fuelSurcharges.reduce((a, b) => a + b.value, 0) / fuelSurcharges.length
      : 0

    return { avgMargin, worstRoute, bestRoute, negativeCount, avgFuel }
  }, [matrix, carrierSurcharges])

  // ── Period filter — drives the shipment-volume KPIs and carrier utilization ──
  const months = useMemo(
    () => [...new Set(shipmentStats.map((s) => s.month))].sort(),
    [shipmentStats],
  )
  const [periodStart, setPeriodStart] = useState(months[months.length - 1] ?? '')
  const [periodEnd, setPeriodEnd] = useState(months[months.length - 1] ?? '')

  const periodStats = useMemo(
    () => shipmentStats.filter((s) => s.month >= periodStart && s.month <= periodEnd),
    [shipmentStats, periodStart, periodEnd],
  )

  const volume = useMemo(() => {
    let shipments = 0, cod = 0, home = 0, pickup = 0
    for (const s of periodStats) {
      shipments += s.shipment_count
      cod += s.cod_count ?? 0
      if (s.delivery_type === 'home') home += s.shipment_count
      if (s.delivery_type === 'pickup') pickup += s.shipment_count
    }
    return { shipments, cod, prepaid: shipments - cod, home, pickup }
  }, [periodStats])

  if (!kpis) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-16 text-center text-gray-400 text-sm">
          Žádná data pro analýzu — nejprve nastavte ceny zákazníků a dopravců.
        </CardContent>
      </Card>
    )
  }

  return (
    <Tabs defaultValue="prehled" className="space-y-4">
      <TabsList>
        <TabsTrigger value="prehled">Přehled</TabsTrigger>
        <TabsTrigger value="priplatky">Vliv příplatků</TabsTrigger>
      </TabsList>

      <TabsContent value="priplatky">
        <FuelSurchargeSimulator matrix={matrix} carriers={carriers} shipmentStats={shipmentStats} />
      </TabsContent>

      <TabsContent value="prehled">
      <div className="space-y-4">

      {/* Period filter — drives shipment-volume KPIs and carrier utilization */}
      {months.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Období</span>
          <select
            value={periodStart}
            onChange={(e) => { const v = e.target.value; setPeriodStart(v); if (v > periodEnd) setPeriodEnd(v) }}
            className="text-xs font-semibold border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
          >
            {months.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
          </select>
          <span className="text-gray-300">–</span>
          <select
            value={periodEnd}
            onChange={(e) => { const v = e.target.value; setPeriodEnd(v); if (v < periodStart) setPeriodStart(v) }}
            className="text-xs font-semibold border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
          >
            {months.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
          </select>
        </div>
      )}

      {/* Shipment-volume KPIs — react to the selected period */}
      {months.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl bg-white border border-gray-100 p-4 shadow-sm">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Zásilky za období</p>
            <p className="text-3xl font-black text-gray-900 mt-1">{volume.shipments.toLocaleString('cs-CZ')}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">
              {periodStart === periodEnd ? formatMonth(periodStart) : `${months.filter(m => m >= periodStart && m <= periodEnd).length} měsíců`}
            </p>
          </div>
          <div className="rounded-xl bg-white border border-gray-100 p-4 shadow-sm">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Dobírky</p>
            <p className="text-2xl font-black text-amber-600 mt-1">
              {volume.shipments > 0 ? Math.round((volume.cod / volume.shipments) * 100) : 0}%
            </p>
            <p className="text-[9px] text-gray-400 mt-0.5">{volume.cod.toLocaleString('cs-CZ')} zásilek</p>
          </div>
          <div className="rounded-xl bg-white border border-gray-100 p-4 shadow-sm">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Doručení domů</p>
            <p className="text-2xl font-black text-indigo-600 mt-1">
              {(volume.home + volume.pickup) > 0 ? Math.round((volume.home / (volume.home + volume.pickup)) * 100) : 0}%
            </p>
            <p className="text-[9px] text-gray-400 mt-0.5">{volume.home.toLocaleString('cs-CZ')} zásilek</p>
          </div>
          <div className="rounded-xl bg-white border border-gray-100 p-4 shadow-sm">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Výdejní místa</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">
              {(volume.home + volume.pickup) > 0 ? Math.round((volume.pickup / (volume.home + volume.pickup)) * 100) : 0}%
            </p>
            <p className="text-[9px] text-gray-400 mt-0.5">{volume.pickup.toLocaleString('cs-CZ')} zásilek</p>
          </div>
        </div>
      )}

      {/* Margin KPIs — current pricing state (margins are not stored per month) */}
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider pt-1">Marže — aktuální stav</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Avg margin */}
        <div className={cn(
          'rounded-xl p-4 relative overflow-hidden',
          kpis.avgMargin >= 5 ? 'bg-gradient-to-br from-emerald-500 to-emerald-600' :
          kpis.avgMargin >= 0 ? 'bg-gradient-to-br from-amber-500 to-amber-600' :
          'bg-gradient-to-br from-red-500 to-red-600'
        )}>
          <div className="absolute top-2 right-2 opacity-10">
            <Scale className="h-14 w-14 text-white" />
          </div>
          <p className="text-[10px] font-medium text-white/80 uppercase tracking-wider">Prům. marže</p>
          <p className="text-3xl font-black text-white mt-1">{kpis.avgMargin.toFixed(1)}%</p>
        </div>

        {/* Negative routes */}
        <div className="rounded-xl bg-white border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Ztrátové</p>
            <div className={cn('h-6 w-6 rounded-md flex items-center justify-center',
              kpis.negativeCount > 0 ? 'bg-red-50' : 'bg-green-50')}>
              <TrendingDown className={cn('h-3 w-3', kpis.negativeCount > 0 ? 'text-red-500' : 'text-green-500')} />
            </div>
          </div>
          <p className={cn('text-2xl font-black mt-1',
            kpis.negativeCount > 0 ? 'text-red-600' : 'text-green-600')}>{kpis.negativeCount}</p>
          <p className="text-[9px] text-gray-400 mt-0.5 truncate">
            Nejhorší: {kpis.worstRoute.country.code}/{kpis.worstRoute.carrier.code} ({kpis.worstRoute.margin_pct.toFixed(0)}%)
          </p>
        </div>

        {/* Best route */}
        <div className="rounded-xl bg-white border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Nejlepší</p>
            <div className="h-6 w-6 rounded-md bg-green-50 flex items-center justify-center">
              <TrendingUp className="h-3 w-3 text-green-500" />
            </div>
          </div>
          <p className="text-2xl font-black text-green-600 mt-1">{kpis.bestRoute.margin_pct.toFixed(1)}%</p>
          <p className="text-[9px] text-gray-400 mt-0.5 truncate">
            {kpis.bestRoute.country.code}/{kpis.bestRoute.carrier.code}
          </p>
        </div>

        {/* Fuel surcharge */}
        <div className="rounded-xl bg-white border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Palivo</p>
            <div className="h-6 w-6 rounded-md bg-amber-50 flex items-center justify-center">
              <Fuel className="h-3 w-3 text-amber-500" />
            </div>
          </div>
          <p className="text-2xl font-black text-gray-900 mt-1">{kpis.avgFuel.toFixed(1)}%</p>
          <p className="text-[9px] text-gray-400 mt-0.5">prům. palivový příplatek</p>
        </div>
      </div>

      {/* Carrier utilization per country */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-1.5 pt-3.5 px-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-md bg-indigo-50 flex items-center justify-center">
              <PieChart className="h-3 w-3 text-indigo-500" />
            </div>
            <div>
              <CardTitle className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Využití dopravců dle země</CardTitle>
              <p className="text-[10px] text-gray-400">Podíl zásilek na dopravce (data z Balíkobotu)</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CarrierUtilization shipmentStats={periodStats} countries={countries} />
        </CardContent>
      </Card>

      {/* Fuel chart */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-1.5 pt-3.5 px-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-md bg-amber-50 flex items-center justify-center">
              <Fuel className="h-3 w-3 text-amber-500" />
            </div>
            <div>
              <CardTitle className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Palivový příplatek</CardTitle>
              <p className="text-[10px] text-gray-400">Historický vývoj sazby (%)</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <FuelSurchargeChart carrierSurcharges={carrierSurcharges} carriers={carriers} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Carrier comparison */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-1.5 pt-3.5 px-4">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-md bg-blue-50 flex items-center justify-center">
                <BarChart3 className="h-3 w-3 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Srovnání dopravců</CardTitle>
                <p className="text-[10px] text-gray-400">Základ + příplatky (1 kg)</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <CarrierCostComparison matrix={matrix} />
          </CardContent>
        </Card>

        {/* Cost breakdown */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-1.5 pt-3.5 px-4">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-md bg-purple-50 flex items-center justify-center">
                <Layers className="h-3 w-3 text-purple-500" />
              </div>
              <div>
                <CardTitle className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Struktura nákladů</CardTitle>
                <p className="text-[10px] text-gray-400">Základní cena vs. příplatky</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <CostBreakdownChart matrix={matrix} />
          </CardContent>
        </Card>
      </div>

      {/* Detailed margin table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-1.5 pt-3.5 px-4">
          <CardTitle className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Kompletní srovnání marží</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Země</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Dopravce</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Služba</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Zákazník</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Základ</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Přípl.</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Celkem</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Marže</th>
                </tr>
              </thead>
              <tbody>
                {matrix
                  .sort((a, b) => a.margin_pct - b.margin_pct)
                  .map((row) => {
                    const isNeg = row.margin_pct < 0
                    const isLow = row.margin_pct >= 0 && row.margin_pct < 5
                    return (
                      <tr
                        key={`${row.country_carrier_id}-${row.service_name}`}
                        className={cn(
                          'border-b border-gray-50 last:border-0 transition-colors',
                          isNeg ? 'bg-red-50/30 hover:bg-red-50/60' : isLow ? 'bg-amber-50/20 hover:bg-amber-50/40' : 'hover:bg-gray-50'
                        )}
                      >
                        <td className="px-4 py-2 font-semibold text-gray-700">{row.country.code}</td>
                        <td className="px-4 py-2"><CarrierBadge carrier={row.carrier} size="sm" /></td>
                        <td className="px-4 py-2 text-gray-500 truncate max-w-[100px]">{row.service_name ?? '—'}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{row.customer_price_net.toFixed(2)} {row.currency}</td>
                        <td className="px-4 py-2 text-right text-gray-500">{row.carrier_base_price.toFixed(2)} {row.currency}</td>
                        <td className="px-4 py-2 text-right text-gray-500">
                          {row.surcharges_total > 0 ? `${row.surcharges_total.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-700">{row.total_carrier_cost.toFixed(2)} {row.currency}</td>
                        <td className="px-4 py-2 text-right">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] font-bold px-1.5 py-0 h-5',
                              isNeg ? 'bg-red-100 border-red-200 text-red-700'
                                : isLow ? 'bg-amber-100 border-amber-200 text-amber-700'
                                : 'bg-green-50 border-green-200 text-green-700'
                            )}
                          >
                            {row.margin_pct.toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
      </TabsContent>
    </Tabs>
  )
}
