'use client'

import { useMemo, useState } from 'react'
import { CarrierBadge } from '@/components/ui/carrier-badge'
import { Badge } from '@/components/ui/badge'
import { Package, AlertCircle, ChevronDown, ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BalikobotShipmentStats, Carrier } from '@/types'

interface Props {
  stats: BalikobotShipmentStats[]
  carriers: Carrier[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Flag({ code }: { code: string }) {
  return (
    <img
      src={`https://flagcdn.com/24x18/${code.toLowerCase()}.png`}
      srcSet={`https://flagcdn.com/48x36/${code.toLowerCase()}.png 2x`}
      alt={code} width={24} height={18}
      className="inline-block rounded-sm align-middle shrink-0"
    />
  )
}

function SplitBar({ aVal, bVal, aColor, bColor }: { aVal: number; bVal: number; aColor: string; bColor: string }) {
  const total = aVal + bVal
  if (total === 0) return <div className="h-1.5 w-full rounded-full bg-gray-100" />
  return (
    <div className="flex h-1.5 w-full rounded-full overflow-hidden">
      <div className="h-full" style={{ width: `${(aVal / total) * 100}%`, backgroundColor: aColor }} />
      <div className="h-full flex-1" style={{ backgroundColor: bColor }} />
    </div>
  )
}

const MONTH_ABBR = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čer', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro']
const MONTH_FULL = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']

function formatMonthRange(start: string, end: string) {
  const [sy, smo] = start.split('-')
  const [ey, emo] = end.split('-')
  if (start === end) return `${MONTH_FULL[parseInt(smo) - 1]} ${sy}`
  if (sy === ey) return `${MONTH_FULL[parseInt(smo) - 1]}–${MONTH_FULL[parseInt(emo) - 1]} ${sy}`
  return `${MONTH_FULL[parseInt(smo) - 1]} ${sy} – ${MONTH_FULL[parseInt(emo) - 1]} ${ey}`
}

const deliveryLabel = (d: string | null) =>
  d === 'home' ? 'Domů' : d === 'pickup' ? 'Výdejní místo' : null

// ─── Month Range Picker ───────────────────────────────────────────────────────

function MonthRangePicker({
  available, start, end, onChange,
}: {
  available: Set<string>
  start: string
  end: string
  onChange: (s: string, e: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)

  const years = useMemo(
    () => [...new Set([...available].map((m) => m.slice(0, 4)))].sort(),
    [available],
  )
  const [displayYear, setDisplayYear] = useState(() => end.slice(0, 4))

  const previewStart = picking && hover ? (hover < picking ? hover : picking) : start
  const previewEnd   = picking && hover ? (hover > picking ? hover : picking) : end

  const handleClick = (m: string) => {
    if (!picking) {
      setPicking(m)
      onChange(m, m)
    } else {
      onChange(m < picking ? m : picking, m > picking ? m : picking)
      setPicking(null)
      setHover(null)
      setOpen(false)
    }
  }

  const close = () => { setOpen(false); setPicking(null); setHover(null) }
  const yIdx = years.indexOf(displayYear)

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((v) => !v); setPicking(null) }}
        className="flex items-center gap-2 text-sm font-semibold border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 hover:border-gray-300 transition-colors shadow-sm"
      >
        <Calendar className="h-3.5 w-3.5 text-gray-400" />
        {formatMonthRange(start, end)}
        <ChevronDown className="h-3 w-3 text-gray-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute top-full left-0 mt-1.5 z-20 bg-white rounded-xl border border-gray-200 shadow-xl p-3 w-64">
            {/* Year navigation */}
            <div className="flex items-center justify-between mb-2.5">
              <button
                onClick={() => yIdx > 0 && setDisplayYear(years[yIdx - 1])}
                disabled={yIdx === 0}
                className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-25 disabled:cursor-default transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5 text-gray-500" />
              </button>
              <span className="text-sm font-bold text-gray-700">{displayYear}</span>
              <button
                onClick={() => yIdx < years.length - 1 && setDisplayYear(years[yIdx + 1])}
                disabled={yIdx >= years.length - 1}
                className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-25 disabled:cursor-default transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
              </button>
            </div>

            {/* Month grid */}
            <div className="grid grid-cols-4 gap-1">
              {MONTH_ABBR.map((name, i) => {
                const m = `${displayYear}-${String(i + 1).padStart(2, '0')}`
                const avail = available.has(m)
                const inRange = m >= previewStart && m <= previewEnd
                const isStart = m === previewStart
                const isEnd = m === previewEnd
                return (
                  <button
                    key={m}
                    disabled={!avail}
                    onClick={() => avail && handleClick(m)}
                    onMouseEnter={() => picking && avail && setHover(m)}
                    onMouseLeave={() => setHover(null)}
                    className={cn(
                      'py-2 rounded-lg text-[11px] font-semibold transition-colors select-none',
                      !avail && 'text-gray-200 cursor-default',
                      avail && !inRange && 'text-gray-600 hover:bg-gray-100 cursor-pointer',
                      inRange && !(isStart || isEnd) && 'bg-blue-50 text-blue-600 rounded-none',
                      isStart && 'bg-blue-600 text-white rounded-r-none rounded-l-lg',
                      isEnd && 'bg-blue-600 text-white rounded-l-none rounded-r-lg',
                      isStart && isEnd && 'rounded-lg',
                    )}
                  >
                    {name}
                  </button>
                )
              })}
            </div>

            {picking && (
              <p className="text-[10px] text-center text-gray-400 mt-2.5 border-t border-gray-100 pt-2">
                Klikni na druhý měsíc pro výběr rozsahu
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

const SELECT_CLS = 'text-[10px] font-medium border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600 focus:ring-1 focus:ring-blue-400/30 focus:outline-none'

export function ShipmentDashboard({ stats, carriers }: Props) {
  const months = useMemo(
    () => [...new Set(stats.map((s) => s.month))].sort(),
    [stats],
  )

  const [rangeStart, setRangeStart] = useState(months[months.length - 1] ?? '')
  const [rangeEnd,   setRangeEnd]   = useState(months[months.length - 1] ?? '')

  const [filterCountry,  setFilterCountry]  = useState('all')
  const [filterCarrier,  setFilterCarrier]  = useState('all')
  const [filterDelivery, setFilterDelivery] = useState('all')
  const [filterCod,      setFilterCod]      = useState('all')

  const handleRangeChange = (s: string, e: string) => {
    setRangeStart(s)
    setRangeEnd(e)
  }

  const monthStats = useMemo(
    () => stats.filter((s) => s.month >= rangeStart && s.month <= rangeEnd),
    [stats, rangeStart, rangeEnd],
  )

  const totals = useMemo(() => {
    let shipments = 0, cod = 0, home = 0, pickup = 0
    for (const s of monthStats) {
      shipments += s.shipment_count
      cod += s.cod_count ?? 0
      if (s.delivery_type === 'home')   home   += s.shipment_count
      if (s.delivery_type === 'pickup') pickup += s.shipment_count
    }
    return { shipments, cod, prepaid: shipments - cod, home, pickup }
  }, [monthStats])

  // MoM only meaningful for single-month view
  const isSingleMonth = rangeStart === rangeEnd
  const changePercent = useMemo(() => {
    if (!isSingleMonth) return null
    const idx = months.indexOf(rangeStart)
    if (idx <= 0) return null
    const prev = stats.filter((s) => s.month === months[idx - 1]).reduce((n, s) => n + s.shipment_count, 0)
    return prev === 0 ? null : ((totals.shipments - prev) / prev) * 100
  }, [isSingleMonth, months, rangeStart, stats, totals.shipments])

  type CarrierEntry = {
    carrier: NonNullable<BalikobotShipmentStats['carrier']>
    deliveryType: string | null
    lastMile: string | null
    count: number; cod: number; home: number; pickup: number
    avgPrice: number | null; currency: string | null
  }
  type CountryRow = {
    country: NonNullable<BalikobotShipmentStats['country']>
    total: number; cod: number
    carriers: Map<string, CarrierEntry>
  }

  const countryOverview = useMemo(() => {
    const map = new Map<string, CountryRow>()
    for (const s of monthStats) {
      if (!s.country) continue
      const row = map.get(s.country.id) ?? { country: s.country, total: 0, cod: 0, carriers: new Map() }
      row.total += s.shipment_count
      row.cod   += s.cod_count ?? 0
      if (s.carrier) {
        // One line per distinct service = carrier × delivery type × last-mile,
        // so e.g. GLS "domů" and GLS "výdejní místo" appear as separate rows
        // (Lokia exposes them via different service types).
        const svcKey = `${s.carrier.id}__${s.delivery_type ?? ''}__${s.last_mile_carrier ?? ''}`
        const ce = row.carriers.get(svcKey) ?? {
          carrier: s.carrier, deliveryType: s.delivery_type ?? null, lastMile: s.last_mile_carrier ?? null,
          count: 0, cod: 0, home: 0, pickup: 0, avgPrice: null, currency: null,
        }
        ce.count += s.shipment_count
        ce.cod   += s.cod_count ?? 0
        if (s.delivery_type === 'home')   ce.home   += s.shipment_count
        if (s.delivery_type === 'pickup') ce.pickup += s.shipment_count
        if (s.avg_shipping_price != null) {
          ce.avgPrice = ce.avgPrice == null ? s.avg_shipping_price : (ce.avgPrice + s.avg_shipping_price) / 2
          ce.currency = s.shipping_currency ?? ce.currency
        }
        row.carriers.set(svcKey, ce)
      }
      map.set(s.country.id, row)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [monthStats])

  const availableCountries = useMemo(() => countryOverview.map((r) => r.country), [countryOverview])
  const availableCarriers  = useMemo(() => {
    const map = new Map<string, NonNullable<BalikobotShipmentStats['carrier']>>()
    for (const s of monthStats) if (s.carrier) map.set(s.carrier.id, s.carrier)
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [monthStats])

  const filteredStats = useMemo(() =>
    monthStats
      .filter((s) => filterCountry  === 'all' || s.country_id  === filterCountry)
      .filter((s) => filterCarrier  === 'all' || s.carrier_id  === filterCarrier)
      .filter((s) => filterDelivery === 'all' || s.delivery_type === filterDelivery)
      .filter((s) => filterCod === 'all' || (filterCod === 'yes' ? (s.cod_count ?? 0) > 0 : (s.cod_count ?? 0) === 0))
      .sort((a, b) => {
        const cc = (a.country?.code ?? '').localeCompare(b.country?.code ?? '')
        return cc !== 0 ? cc : b.shipment_count - a.shipment_count
      }),
    [monthStats, filterCountry, filterCarrier, filterDelivery, filterCod],
  )

  const pct = (a: number, b: number) => b === 0 ? 0 : Math.round((a / b) * 100)
  const availableSet = useMemo(() => new Set(months), [months])

  if (stats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="rounded-full bg-blue-50 p-5"><Package className="h-9 w-9 text-blue-400" /></div>
        <p className="text-sm font-semibold text-gray-600">Zatím žádná data</p>
        <p className="text-[11px] text-gray-400">Data se synchronizují automaticky každý pracovní den v 20:00.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Range picker ── */}
      <MonthRangePicker
        available={availableSet}
        start={rangeStart}
        end={rangeEnd}
        onChange={handleRangeChange}
      />

      {/* ── 3 KPI cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Celkem zásilek</p>
          <p className="text-4xl font-black text-gray-900 tracking-tight">{totals.shipments.toLocaleString('cs-CZ')}</p>
          {changePercent != null && (
            <Badge variant="outline" className={cn(
              'mt-2 text-[10px] font-bold px-2 py-0.5',
              changePercent >= 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200',
            )}>
              {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(0)}% oproti min. měsíci
            </Badge>
          )}
          <p className="text-[11px] text-gray-400 mt-2">
            {countryOverview.length} zemí
            {!isSingleMonth && <span className="ml-1">· {months.filter(m => m >= rangeStart && m <= rangeEnd).length} měsíců</span>}
          </p>
        </div>

        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Způsob platby</p>
          <div className="flex items-end gap-4 mb-3">
            <div>
              <p className="text-4xl font-black text-gray-900 tracking-tight">{pct(totals.prepaid, totals.shipments)}%</p>
              <p className="text-[11px] font-semibold text-blue-600 mt-0.5">Předem · {totals.prepaid.toLocaleString('cs-CZ')}</p>
            </div>
            <div className="pb-0.5">
              <p className="text-2xl font-black text-amber-500">{pct(totals.cod, totals.shipments)}%</p>
              <p className="text-[11px] font-semibold text-amber-500">Dobírka · {totals.cod.toLocaleString('cs-CZ')}</p>
            </div>
          </div>
          <SplitBar aVal={totals.prepaid} bVal={totals.cod} aColor="#3b82f6" bColor="#f59e0b" />
        </div>

        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Způsob doručení</p>
          <div className="flex items-end gap-4 mb-3">
            <div>
              <p className="text-4xl font-black text-gray-900 tracking-tight">{pct(totals.home, totals.home + totals.pickup)}%</p>
              <p className="text-[11px] font-semibold text-indigo-600 mt-0.5">Domů · {totals.home.toLocaleString('cs-CZ')}</p>
            </div>
            <div className="pb-0.5">
              <p className="text-2xl font-black text-emerald-500">{pct(totals.pickup, totals.home + totals.pickup)}%</p>
              <p className="text-[11px] font-semibold text-emerald-600">Výdejní místo · {totals.pickup.toLocaleString('cs-CZ')}</p>
            </div>
          </div>
          <SplitBar aVal={totals.home} bVal={totals.pickup} aColor="#6366f1" bColor="#10b981" />
        </div>
      </div>

      {/* ── Country cards ── */}
      <div className="space-y-3">
        {countryOverview.map((row) => {
          const carrierList = [...row.carriers.values()].sort((a, b) => b.count - a.count)
          return (
            <div key={row.country.id} className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                <Flag code={row.country.code} />
                <span className="font-black text-gray-800 text-base">{row.country.code}</span>
                <span className="text-sm font-bold text-gray-700">{row.total.toLocaleString('cs-CZ')}</span>
                <span className="text-xs text-gray-400 font-medium">{pct(row.total, totals.shipments)}% celku</span>
                <div className="ml-auto flex items-center gap-3">
                  {row.cod > 0 ? (
                    <>
                      <span className="text-[11px] text-amber-600 font-semibold">Dobírka {pct(row.cod, row.total)}%</span>
                      <span className="text-[11px] text-gray-400">{row.cod.toLocaleString('cs-CZ')} zásilek</span>
                    </>
                  ) : <span className="text-[11px] text-gray-300">Bez dobírek</span>}
                </div>
              </div>

              <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="text-left py-2 pl-5 pr-4 font-medium text-gray-400 text-[10px] uppercase tracking-wider w-48">Dopravce</th>
                    <th className="text-right py-2 px-4 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Zásilek</th>
                    <th className="text-right py-2 px-4 font-medium text-gray-400 text-[10px] uppercase tracking-wider">% v zemi</th>
                    <th className="text-right py-2 px-4 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Dobírky</th>
                    <th className="text-right py-2 px-4 font-medium text-gray-400 text-[10px] uppercase tracking-wider">COD %</th>
                    <th className="text-right py-2 px-4 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Domů</th>
                    <th className="text-right py-2 px-4 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Výdejní</th>
                    <th className="text-right py-2 pr-5 pl-4 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Ø cena</th>
                  </tr>
                </thead>
                <tbody>
                  {carrierList.map((c, idx) => {
                    const dl = deliveryLabel(c.deliveryType)
                    const svc = c.lastMile ? (dl ? `${c.lastMile} · ${dl.toLowerCase()}` : c.lastMile) : dl
                    return (
                    <tr key={`${c.carrier.id}-${c.deliveryType ?? ''}-${c.lastMile ?? ''}`} className={cn(
                      'hover:bg-blue-50/20 transition-colors',
                      idx < carrierList.length - 1 && 'border-b border-gray-50',
                    )}>
                      <td className="py-2.5 pl-5 pr-4">
                        <div className="flex items-center gap-2 min-w-0">
                          <CarrierBadge carrier={c.carrier} size="sm" />
                          {svc && <span className="text-[10px] text-gray-500 truncate">{svc}</span>}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-gray-800">{c.count.toLocaleString('cs-CZ')}</td>
                      <td className="py-2.5 px-4 text-right text-gray-500">{pct(c.count, row.total)}%</td>
                      <td className="py-2.5 px-4 text-right">
                        {c.cod > 0 ? <span className="text-amber-700 font-medium">{c.cod.toLocaleString('cs-CZ')}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {c.cod > 0 ? <span className="text-amber-500 font-medium">{pct(c.cod, c.count)}%</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {c.home > 0 ? <span className="text-indigo-600">{c.home.toLocaleString('cs-CZ')}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {c.pickup > 0 ? <span className="text-emerald-600">{c.pickup.toLocaleString('cs-CZ')}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2.5 pl-4 pr-5 text-right text-gray-500">
                        {c.avgPrice != null ? `${c.avgPrice.toFixed(0)} ${c.currency ?? ''}` : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Detail table ── */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-2 px-5 py-3 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
            Detail — typ služby
            {filteredStats.length !== monthStats.length && (
              <span className="ml-2 text-blue-500 normal-case font-normal">{filteredStats.length} záznamů</span>
            )}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <select value={filterCountry}  onChange={(e) => setFilterCountry(e.target.value)}  className={SELECT_CLS}>
              <option value="all">Všechny země</option>
              {availableCountries.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
            <select value={filterCarrier}  onChange={(e) => setFilterCarrier(e.target.value)}  className={SELECT_CLS}>
              <option value="all">Všichni dopravci</option>
              {availableCarriers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
            <select value={filterDelivery} onChange={(e) => setFilterDelivery(e.target.value)} className={SELECT_CLS}>
              <option value="all">Doručení: vše</option>
              <option value="home">🏠 Domů</option>
              <option value="pickup">📦 Výdejní místo</option>
            </select>
            <select value={filterCod}      onChange={(e) => setFilterCod(e.target.value)}      className={SELECT_CLS}>
              <option value="all">Dobírky: vše</option>
              <option value="yes">Dobírka: ano</option>
              <option value="no">Dobírka: ne</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/40">
              <th className="text-left py-2 pl-5 pr-4 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Země</th>
              <th className="text-left py-2 px-4 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Dopravce</th>
              <th className="text-left py-2 px-4 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Doručení</th>
              <th className="text-right py-2 px-4 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Zásilek</th>
              <th className="text-right py-2 px-4 font-medium text-gray-400 text-[10px] uppercase tracking-wider">% v zemi</th>
              <th className="text-right py-2 px-4 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Dobírky</th>
              <th className="text-right py-2 pr-5 pl-4 font-medium text-gray-400 text-[10px] uppercase tracking-wider">Ø cena</th>
            </tr>
          </thead>
          <tbody>
            {filteredStats.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-gray-400">
                <AlertCircle className="h-4 w-4 inline mr-1.5" />Žádné záznamy pro zvolené filtry
              </td></tr>
            ) : filteredStats.map((s) => {
              const countryTotal = countryOverview.find((c) => c.country.id === s.country_id)?.total ?? 0
              const codPct = (s.cod_count ?? 0) > 0 ? pct(s.cod_count ?? 0, s.shipment_count) : null
              return (
                <tr key={`${s.id}-${s.month}`} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/20 transition-colors">
                  <td className="py-2 pl-5 pr-4">
                    <div className="flex items-center gap-1.5">
                      {s.country && <Flag code={s.country.code} />}
                      <span className="font-semibold text-gray-700">{s.country?.code ?? '?'}</span>
                    </div>
                  </td>
                  <td className="py-2 px-4">{s.carrier && <CarrierBadge carrier={s.carrier} size="sm" />}</td>
                  <td className="py-2 px-4">
                    {s.delivery_type === 'home'   && <span className="text-indigo-600">🏠 Domů{s.last_mile_carrier ? ` · ${s.last_mile_carrier}` : ''}</span>}
                    {s.delivery_type === 'pickup' && <span className="text-emerald-600">📦 Výdejní místo{s.last_mile_carrier ? ` · ${s.last_mile_carrier}` : ''}</span>}
                    {!s.delivery_type && <span className="text-gray-300">{s.service_type ?? '—'}</span>}
                  </td>
                  <td className="py-2 px-4 text-right font-bold text-gray-800">{s.shipment_count.toLocaleString('cs-CZ')}</td>
                  <td className="py-2 px-4 text-right text-gray-400">{pct(s.shipment_count, countryTotal)}%</td>
                  <td className="py-2 px-4 text-right">
                    {codPct != null
                      ? <span className="text-amber-700">{s.cod_count} <span className="text-[10px] text-amber-400">({codPct}%)</span></span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-2 pl-4 pr-5 text-right text-gray-500">
                    {s.avg_shipping_price != null ? `${s.avg_shipping_price.toFixed(0)} ${s.shipping_currency ?? ''}` : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
