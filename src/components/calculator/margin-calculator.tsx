'use client'

import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FlagImage } from '@/components/ui/flag-image'
import { CarrierBadge } from '@/components/ui/carrier-badge'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/constants'
import { exportMarginCSV, type SimulationRow } from '@/lib/export-csv'
import {
  Download,
  RotateCcw,
  Home,
  Package,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  X,
} from 'lucide-react'
import type { ProfitabilityRow, Currency } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MarginCalculatorProps {
  matrix: ProfitabilityRow[]
  exchangeRates: Record<Currency, number>
  volumeMap?: Record<string, number>
}

interface Override {
  newCarrierCost?: string  // string for input binding
  newCartPrice?: string
}

type OverrideMap = Record<string, Override>

function rowKey(row: ProfitabilityRow): string {
  return `${row.country_carrier_id}__${row.delivery_type}__${row.service_name ?? ''}`
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MarginCalculator({ matrix, exchangeRates, volumeMap = {} }: MarginCalculatorProps) {
  const [filterCountry, setFilterCountry] = useState('all')
  const [filterCarrier, setFilterCarrier] = useState('all')
  const [filterMargin, setFilterMargin] = useState<'all' | 'negative' | 'under10' | 'under20'>('all')
  const [overrides, setOverrides] = useState<OverrideMap>({})

  // Unique values for filters
  const countries = useMemo(() => {
    const set = new Map<string, { code: string; name: string; flag: string }>()
    matrix.forEach(r => {
      if (!set.has(r.country.code)) set.set(r.country.code, { code: r.country.code, name: r.country.name, flag: r.country.flag })
    })
    return [...set.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [matrix])

  const carriers = useMemo(() => {
    const set = new Map<string, { code: string; name: string; logo_color: string }>()
    matrix.forEach(r => {
      if (!set.has(r.carrier.code)) set.set(r.carrier.code, { code: r.carrier.code, name: r.carrier.name, logo_color: r.carrier.logo_color })
    })
    return [...set.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [matrix])

  // Filtered rows
  const filteredRows = useMemo(() => {
    return matrix.filter(r => {
      if (filterCountry !== 'all' && r.country.code !== filterCountry) return false
      if (filterCarrier !== 'all' && r.carrier.code !== filterCarrier) return false
      if (filterMargin === 'negative' && !(r.margin_pct < 0)) return false
      if (filterMargin === 'under10' && !(r.margin_pct < 10)) return false
      if (filterMargin === 'under20' && !(r.margin_pct < 20)) return false
      return true
    }).sort((a, b) => {
      if (filterMargin !== 'all') return a.margin_pct - b.margin_pct
      const c = a.country.code.localeCompare(b.country.code)
      return c !== 0 ? c : a.carrier.name.localeCompare(b.carrier.name)
    })
  }, [matrix, filterCountry, filterCarrier, filterMargin])

  // Compute simulated margins
  const simulatedRows = useMemo((): SimulationRow[] => {
    return filteredRows.map(row => {
      const key = rowKey(row)
      const ov = overrides[key]

      // Carrier cost override is in CZK
      const newCarrierCostCZK = ov?.newCarrierCost && ov.newCarrierCost !== ''
        ? parseFloat(ov.newCarrierCost)
        : null
      // Cart price override is in local currency (with VAT)
      const newCartPriceVal = ov?.newCartPrice && ov.newCartPrice !== ''
        ? parseFloat(ov.newCartPrice)
        : null

      // Convert carrier cost CZK → local currency for margin calc
      const rate = exchangeRates[row.currency] ?? 1
      const carrierCostLocal = newCarrierCostCZK != null
        ? newCarrierCostCZK / rate
        : row.total_carrier_cost
      const carrierCostCZK = newCarrierCostCZK ?? row.total_carrier_cost_czk

      const cartPrice = newCartPriceVal ?? row.customer_price
      const vatRate = row.country.vat_rate ?? 0
      const customerPriceNet = cartPrice / (1 + vatRate)
      const newMargin = customerPriceNet - carrierCostLocal
      const newMarginCZK = newMargin * rate
      const newMarginPct = customerPriceNet > 0 ? (newMargin / customerPriceNet) * 100 : 0

      const marginDeltaCZK = newMarginCZK - row.margin_czk
      const annualVolume = row.delivery_type
        ? (volumeMap[`${row.country.id}__${row.carrier.id}__${row.delivery_type}`] ?? 0)
        : 0
      const hasOverride = newCarrierCostCZK !== null || newCartPriceVal !== null
      const annualImpactCZK = hasOverride && annualVolume > 0
        ? marginDeltaCZK * annualVolume
        : null

      return {
        row,
        newCarrierCostCZK: newCarrierCostCZK,
        newCartPrice: newCartPriceVal,
        newMargin,
        newMarginCZK,
        newMarginPct,
        annualVolume,
        annualImpactCZK,
      }
    })
  }, [filteredRows, overrides, volumeMap])

  // Stats
  const changedCount = useMemo(() => {
    return Object.values(overrides).filter(o =>
      (o.newCarrierCost && o.newCarrierCost !== '') || (o.newCartPrice && o.newCartPrice !== '')
    ).length
  }, [overrides])

  const avgCurrentMargin = useMemo(() => {
    if (simulatedRows.length === 0) return 0
    return simulatedRows.reduce((s, r) => s + r.row.margin_pct, 0) / simulatedRows.length
  }, [simulatedRows])

  const avgNewMargin = useMemo(() => {
    if (simulatedRows.length === 0) return 0
    return simulatedRows.reduce((s, r) => s + r.newMarginPct, 0) / simulatedRows.length
  }, [simulatedRows])

  const totalAnnualImpactCZK = useMemo(() => {
    return simulatedRows.reduce((sum, r) => sum + (r.annualImpactCZK ?? 0), 0)
  }, [simulatedRows])

  // Override handlers
  const setOverride = useCallback((key: string, field: 'newCarrierCost' | 'newCartPrice', value: string) => {
    setOverrides(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }))
  }, [])

  const clearOverride = useCallback((key: string) => {
    setOverrides(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const clearAll = useCallback(() => setOverrides({}), [])

  function handleExport(onlyChanged: boolean) {
    exportMarginCSV(simulatedRows, exchangeRates, onlyChanged)
  }

  return (
    <div className="space-y-3">
      {/* Filters + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterCountry} onValueChange={v => setFilterCountry(v ?? 'all')}>
          <SelectTrigger className="w-40 h-7 text-[11px] border-gray-200">
            <SelectValue>{filterCountry === 'all' ? 'Všechny země' : filterCountry}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny země</SelectItem>
            {countries.map(c => (
              <SelectItem key={c.code} value={c.code}>
                <span className="flex items-center gap-1.5">
                  <FlagImage code={c.code} /> {c.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCarrier} onValueChange={v => setFilterCarrier(v ?? 'all')}>
          <SelectTrigger className="w-36 h-7 text-[11px] border-gray-200">
            <SelectValue>{filterCarrier === 'all' ? 'Dopravce: vše' : filterCarrier}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všichni dopravci</SelectItem>
            {carriers.map(c => (
              <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterMargin} onValueChange={v => setFilterMargin(v as 'all' | 'negative' | 'under10' | 'under20')}>
          <SelectTrigger className={cn('w-36 h-7 text-[11px] border-gray-200', filterMargin !== 'all' && 'border-red-300 text-red-700 bg-red-50')}>
            <SelectValue>
              {filterMargin === 'all' ? 'Marže: vše' : filterMargin === 'negative' ? 'Ztrátové' : filterMargin === 'under10' ? 'Pod 10 %' : 'Pod 20 %'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Marže: vše</SelectItem>
            <SelectItem value="negative">Ztrátové (&lt; 0 %)</SelectItem>
            <SelectItem value="under10">Pod 10 %</SelectItem>
            <SelectItem value="under20">Pod 20 %</SelectItem>
          </SelectContent>
        </Select>

        <div className="h-4 w-px bg-gray-200 mx-1" />

        <span className="text-[11px] text-gray-500">{filteredRows.length} tras</span>
        {changedCount > 0 && (
          <Badge variant="outline" className="text-[10px] bg-blue-50 border-blue-200 text-blue-600 px-1.5 py-0 h-5">
            {changedCount} změněno
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {changedCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-[11px] text-gray-500 gap-1" onClick={clearAll}>
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] gap-1"
            disabled={changedCount === 0}
            onClick={() => handleExport(true)}
          >
            <Download className="h-3 w-3" /> Export změn (CSV)
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] gap-1"
            onClick={() => handleExport(false)}
          >
            <Download className="h-3 w-3" /> Export vše
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      {changedCount > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-blue-200/60 bg-blue-50/40 px-4 py-2.5">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-gray-500">Průměr marží:</span>
            <span className={cn('font-bold', avgCurrentMargin < 0 ? 'text-red-600' : 'text-gray-700')}>
              {avgCurrentMargin.toFixed(1)}%
            </span>
            <ArrowRight className="h-3 w-3 text-gray-400" />
            <span className={cn('font-bold', avgNewMargin < 0 ? 'text-red-600' : avgNewMargin > avgCurrentMargin ? 'text-emerald-600' : 'text-amber-600')}>
              {avgNewMargin.toFixed(1)}%
            </span>
            {avgNewMargin !== avgCurrentMargin && (
              <Badge variant="outline" className={cn(
                'text-[10px] font-bold px-1.5 py-0 h-5',
                avgNewMargin > avgCurrentMargin
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              )}>
                {avgNewMargin > avgCurrentMargin ? '+' : ''}{(avgNewMargin - avgCurrentMargin).toFixed(1)} p.b.
              </Badge>
            )}
          </div>
          {totalAnnualImpactCZK !== 0 && (
            <div className="flex items-center gap-2 text-[11px] border-l border-blue-200 pl-4">
              <span className="text-gray-500">Roční dopad (12m):</span>
              <span className={cn(
                'font-bold',
                totalAnnualImpactCZK > 0 ? 'text-emerald-600' : 'text-red-600'
              )}>
                {totalAnnualImpactCZK > 0 ? '+' : ''}{Math.round(totalAnnualImpactCZK).toLocaleString('cs-CZ')} Kč
              </span>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Země</th>
                  <th className="text-left font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Dopravce</th>
                  <th className="text-left font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Služba</th>
                  <th className="text-right font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Nákl. dopravce (CZK)</th>
                  <th className="text-center font-medium text-blue-500 px-3 py-2.5 text-[10px] uppercase tracking-wider bg-blue-50/50">Nový náklad (CZK)</th>
                  <th className="text-right font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Cena v košíku</th>
                  <th className="text-center font-medium text-blue-500 px-3 py-2.5 text-[10px] uppercase tracking-wider bg-blue-50/50">Nová cena košíku</th>
                  <th className="text-right font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Marže</th>
                  <th className="text-right font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Nová marže</th>
                  <th className="text-right font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Zásilky / dopad</th>
                  <th className="text-center font-medium text-gray-400 px-2 py-2.5 text-[10px] uppercase tracking-wider w-8"></th>
                </tr>
              </thead>
              <tbody>
                {simulatedRows.map(({ row, newCarrierCostCZK, newCartPrice, newMargin, newMarginCZK, newMarginPct, annualVolume, annualImpactCZK }) => {
                  const key = rowKey(row)
                  const ov = overrides[key]
                  const hasOverride = newCarrierCostCZK !== null || newCartPrice !== null
                  const codSurcharge = row.surcharges_breakdown.find(s => s.type === 'cod')
                  const codCostCZK = codSurcharge
                    ? codSurcharge.computed_amount * (exchangeRates[row.currency] ?? 1)
                    : null
                  const isNegOld = row.margin_pct < 0
                  const isLowOld = row.margin_pct >= 0 && row.margin_pct < 5
                  const isNegNew = newMarginPct < 0
                  const isLowNew = newMarginPct >= 0 && newMarginPct < 5
                  const marginDelta = newMarginPct - row.margin_pct
                  const improved = marginDelta > 0.1
                  const worsened = marginDelta < -0.1

                  return (
                    <tr
                      key={key}
                      className={cn(
                        'border-b border-gray-50 transition-colors',
                        hasOverride ? 'bg-blue-50/20' : '',
                        'hover:bg-gray-50/60'
                      )}
                    >
                      {/* Country */}
                      <td className="px-3 py-2">
                        <div className="font-semibold text-gray-700 flex items-center gap-1.5">
                          <FlagImage code={row.country.code} />
                          {row.country.code}
                        </div>
                      </td>

                      {/* Carrier */}
                      <td className="px-3 py-2">
                        <CarrierBadge carrier={row.carrier} />
                      </td>

                      {/* Service / delivery type */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 text-gray-600">
                          {row.delivery_type === 'home'
                            ? <Home className="h-2.5 w-2.5 text-gray-400 shrink-0" />
                            : row.delivery_type === 'pickup'
                            ? <Package className="h-2.5 w-2.5 text-gray-400 shrink-0" />
                            : null}
                          <span className="truncate max-w-[80px]">{row.service_name ?? '—'}</span>
                        </div>
                      </td>

                      {/* Current carrier cost (CZK) */}
                      <td className="px-3 py-2 text-right text-[11px]">
                        <span className="font-medium text-gray-700">{row.total_carrier_cost_czk.toFixed(2)} Kč</span>
                        {row.currency !== 'CZK' && (
                          <div className="text-[9px] text-gray-400">{formatCurrency(row.total_carrier_cost, row.currency)}</div>
                        )}
                        {codCostCZK != null && (
                          <div className="text-[9px] text-violet-500 mt-0.5" title="Příplatek za dobírku (COD)">
                            DOB: +{codCostCZK.toFixed(2)} Kč
                          </div>
                        )}
                      </td>

                      {/* New carrier cost in CZK (editable) */}
                      <td className="px-1.5 py-1.5 bg-blue-50/30">
                        <Input
                          type="number"
                          step="0.01"
                          className={cn(
                            'h-7 text-[11px] text-center w-24 mx-auto',
                            newCarrierCostCZK !== null ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
                          )}
                          placeholder={row.total_carrier_cost_czk.toFixed(2)}
                          value={ov?.newCarrierCost ?? ''}
                          onChange={e => setOverride(key, 'newCarrierCost', e.target.value)}
                        />
                      </td>

                      {/* Current cart price */}
                      <td className="px-3 py-2 text-right">
                        <div>
                          <span className="font-semibold text-gray-800 text-[11px]">
                            {formatCurrency(row.customer_price, row.currency)}
                          </span>
                          <div className="text-[9px] text-gray-400">
                            {formatCurrency(row.customer_price_net, row.currency)} bez DPH
                          </div>
                        </div>
                      </td>

                      {/* New cart price (editable) */}
                      <td className="px-1.5 py-1.5 bg-blue-50/30">
                        <Input
                          type="number"
                          step="0.01"
                          className={cn(
                            'h-7 text-[11px] text-center w-24 mx-auto',
                            newCartPrice !== null ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
                          )}
                          placeholder={row.customer_price.toFixed(2)}
                          value={ov?.newCartPrice ?? ''}
                          onChange={e => setOverride(key, 'newCartPrice', e.target.value)}
                        />
                      </td>

                      {/* Current margin */}
                      <td className="px-3 py-2 text-right">
                        <div>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] font-bold px-1.5 py-0 h-5',
                              isNegOld ? 'bg-red-100 border-red-200 text-red-700'
                                : isLowOld ? 'bg-amber-100 border-amber-200 text-amber-700'
                                : 'bg-green-50 border-green-200 text-green-700'
                            )}
                          >
                            {row.margin_pct.toFixed(1)}%
                          </Badge>
                          <div className="text-[9px] text-gray-400 mt-0.5">
                            {row.margin_czk.toFixed(2)} Kč
                            {row.currency !== 'CZK' && <> · {formatCurrency(row.margin, row.currency)}</>}
                          </div>
                        </div>
                      </td>

                      {/* New margin */}
                      <td className="px-3 py-2 text-right">
                        {hasOverride ? (
                          <div>
                            <div className="flex items-center justify-end gap-1">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] font-bold px-1.5 py-0 h-5',
                                  isNegNew ? 'bg-red-100 border-red-200 text-red-700'
                                    : isLowNew ? 'bg-amber-100 border-amber-200 text-amber-700'
                                    : 'bg-green-50 border-green-200 text-green-700'
                                )}
                              >
                                {newMarginPct.toFixed(1)}%
                              </Badge>
                              <span className={cn(
                                'text-[9px] font-semibold',
                                improved ? 'text-emerald-600' : worsened ? 'text-red-600' : 'text-gray-400'
                              )}>
                                {improved ? <TrendingUp className="h-2.5 w-2.5 inline" /> : worsened ? <TrendingDown className="h-2.5 w-2.5 inline" /> : null}
                                {' '}{marginDelta > 0 ? '+' : ''}{marginDelta.toFixed(1)}
                              </span>
                            </div>
                            <div className="text-[9px] text-gray-400 mt-0.5">
                              {newMarginCZK.toFixed(2)} Kč
                              {row.currency !== 'CZK' && <> · {formatCurrency(newMargin, row.currency)}</>}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-300 text-[10px]">—</span>
                        )}
                      </td>

                      {/* Annual volume + impact */}
                      <td className="px-3 py-2 text-right">
                        {(annualVolume ?? 0) > 0 ? (
                          <div>
                            <div className="text-[10px] text-gray-400">
                              {(annualVolume ?? 0).toLocaleString('cs-CZ')} ks
                            </div>
                            {annualImpactCZK != null && (
                              <div className={cn(
                                'text-[10px] font-semibold',
                                annualImpactCZK > 0 ? 'text-emerald-600' : 'text-red-600'
                              )}>
                                {annualImpactCZK > 0 ? '+' : ''}{Math.round(annualImpactCZK).toLocaleString('cs-CZ')} Kč
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-200 text-[10px]">—</span>
                        )}
                      </td>

                      {/* Reset row */}
                      <td className="px-2 py-2 text-center">
                        {hasOverride && (
                          <button
                            className="text-gray-400 hover:text-red-500 transition-colors"
                            onClick={() => clearOverride(key)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}

                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-gray-400">
                      Žádné trasy — nejprve zadejte ceny v sekci Ceník
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
