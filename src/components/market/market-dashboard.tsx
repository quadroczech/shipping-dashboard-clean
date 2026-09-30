'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FlagImage } from '@/components/ui/flag-image'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Target,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Home,
  Package,
} from 'lucide-react'
import type { Country, CustomerPrice, CountryCarrier, Currency } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompetitorPrice {
  id: string
  country_id: string
  competitor_name: string
  competitor_url: string | null
  delivery_type: 'home' | 'pickup'
  carrier_name: string | null
  carrier_label: string | null
  price: number | null
  free_from: number | null
  currency: string
  checked_at: string
  notes: string | null
}

interface OurRoute {
  country_carrier_id: string
  country_id: string
  carrier_code: string
  carrier_name: string
  carrier_color: string
  delivery_type: 'home' | 'pickup'
  service_name: string | null
  price: number
  currency: Currency
}

interface MarketDashboardProps {
  countries: Country[]
  ourRoutes: OurRoute[]
  competitorPrices: CompetitorPrice[]
}

// ─── Carrier colors & icons ───────────────────────────────────────────────────

const CARRIER_COLORS: Record<string, string> = {
  PPL:              'bg-red-100 text-red-700 border-red-200',
  GLS:              'bg-green-100 text-green-700 border-green-200',
  PACKETA:          'bg-rose-100 text-rose-700 border-rose-200',
  SLOVENSKA_POSTA:  'bg-orange-100 text-orange-700 border-orange-200',
}

// ─── Position logic ───────────────────────────────────────────────────────────

function getPosition(ourPrice: number, prices: number[]) {
  if (prices.length === 0) return 'no_data' as const
  const sorted = [...prices].sort((a, b) => a - b)
  const avg = prices.reduce((s, p) => s + p, 0) / prices.length
  const pct = (ourPrice - avg) / avg * 100
  if (ourPrice <= sorted[0]) return 'cheapest' as const
  if (ourPrice >= sorted[sorted.length - 1]) return 'most_expensive' as const
  if (pct < -10) return 'below_avg' as const
  if (pct > 10) return 'above_avg' as const
  return 'average' as const
}

function PositionBadge({ pos }: { pos: ReturnType<typeof getPosition> }) {
  if (pos === 'no_data') return <span className="text-[10px] text-gray-300">Bez dat</span>
  const cfg = {
    cheapest:       { label: 'Nejlevnější', cls: 'bg-blue-100 border-blue-200 text-blue-700' },
    below_avg:      { label: 'Pod průměrem', cls: 'bg-green-50 border-green-200 text-green-700' },
    average:        { label: 'Průměr trhu', cls: 'bg-gray-100 border-gray-200 text-gray-600' },
    above_avg:      { label: 'Nad průměrem', cls: 'bg-amber-50 border-amber-200 text-amber-700' },
    most_expensive: { label: 'Nejdražší', cls: 'bg-red-100 border-red-200 text-red-700' },
  }
  const { label, cls } = cfg[pos]
  return <Badge variant="outline" className={cn('text-[10px] font-semibold px-1.5 py-0 h-5', cls)}>{label}</Badge>
}

function Recommendation({ pos, ourPrice, avg, min, max, canIncrease, currency }: {
  pos: ReturnType<typeof getPosition>
  ourPrice: number; avg: number; min: number; max: number
  canIncrease: number; currency: Currency
}) {
  if (pos === 'no_data') return null
  const fmt = (n: number) => formatCurrency(n, currency)
  if (pos === 'cheapest') return (
    <div className="text-[10px] text-blue-700 bg-blue-50 rounded-md px-2.5 py-1.5 flex items-start gap-1.5">
      <TrendingUp className="h-3 w-3 shrink-0 mt-0.5" />
      <span>Jsi nejlevnější. Můžeš zdražit až o <strong>{fmt(canIncrease)}</strong> a dostat se na průměr trhu ({fmt(avg)}).</span>
    </div>
  )
  if (pos === 'below_avg') return (
    <div className="text-[10px] text-green-700 bg-green-50 rounded-md px-2.5 py-1.5 flex items-start gap-1.5">
      <TrendingUp className="h-3 w-3 shrink-0 mt-0.5" />
      <span>Pod průměrem trhu. Prostor ke zdražení: <strong>{fmt(canIncrease)}</strong> (průměr: {fmt(avg)}).</span>
    </div>
  )
  if (pos === 'average') return (
    <div className="text-[10px] text-gray-600 bg-gray-50 rounded-md px-2.5 py-1.5 flex items-start gap-1.5">
      <Target className="h-3 w-3 shrink-0 mt-0.5" />
      <span>Cena odpovídá průměru trhu ({fmt(avg)}). Rozmezí: {fmt(min)}–{fmt(max)}.</span>
    </div>
  )
  if (pos === 'above_avg') return (
    <div className="text-[10px] text-amber-700 bg-amber-50 rounded-md px-2.5 py-1.5 flex items-start gap-1.5">
      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
      <span>Nad průměrem trhu o <strong>{fmt(ourPrice - avg)}</strong>. Průměr: {fmt(avg)}, nejlevnější: {fmt(min)}.</span>
    </div>
  )
  return (
    <div className="text-[10px] text-red-700 bg-red-50 rounded-md px-2.5 py-1.5 flex items-start gap-1.5">
      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
      <span>Nejdražší na trhu! Nad průměrem o <strong>{fmt(ourPrice - avg)}</strong>. Zvažte snížení na max. {fmt(max)}.</span>
    </div>
  )
}

// ─── Add/Edit dialog ──────────────────────────────────────────────────────────

const KNOWN_CARRIERS = [
  { name: 'PPL', label: 'PPL' },
  { name: 'GLS', label: 'GLS' },
  { name: 'PACKETA', label: 'Zásilkovna / Packeta' },
  { name: 'SLOVENSKA_POSTA', label: 'Slovenská pošta' },
  { name: 'DPD', label: 'DPD' },
  { name: 'DHL', label: 'DHL' },
  { name: 'OTHER', label: 'Jiný / neuvedeno' },
]

function CompetitorDialog({
  countries,
  existing,
  presetCountryId,
  presetCarrierName,
  onClose,
}: {
  countries: Country[]
  existing?: CompetitorPrice
  presetCountryId?: string
  presetCarrierName?: string
  onClose: () => void
}) {
  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    country_id:      existing?.country_id      ?? presetCountryId ?? '',
    competitor_name: existing?.competitor_name ?? '',
    competitor_url:  existing?.competitor_url  ?? '',
    delivery_type:  (existing?.delivery_type   ?? 'home') as 'home' | 'pickup',
    carrier_name:    existing?.carrier_name    ?? presetCarrierName ?? 'GLS',
    carrier_label:   existing?.carrier_label   ?? '',
    price:           existing?.price != null   ? String(existing.price) : '',
    free_from:       existing?.free_from != null ? String(existing.free_from) : '',
    currency:        existing?.currency        ?? 'EUR',
    notes:           existing?.notes           ?? '',
  })

  function upd<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function onCountryChange(v: string) {
    const c = countries.find(c => c.id === v)
    setForm(p => ({ ...p, country_id: v, currency: c?.currency ?? p.currency }))
  }

  function onCarrierChange(v: string) {
    const c = KNOWN_CARRIERS.find(c => c.name === v)
    setForm(p => ({ ...p, carrier_name: v, carrier_label: c?.label !== 'Jiný / neuvedeno' ? (c?.label ?? '') : p.carrier_label }))
  }

  async function save() {
    if (!form.country_id || !form.competitor_name || !form.carrier_name) {
      toast.error('Vyplňte zemi, název e-shopu a dopravce')
      return
    }
    setSaving(true)
    try {
      const payload = {
        country_id: form.country_id,
        competitor_name: form.competitor_name,
        competitor_url: form.competitor_url || null,
        delivery_type: form.delivery_type,
        carrier_name: form.carrier_name,
        carrier_label: form.carrier_label || form.carrier_name,
        price: form.price ? parseFloat(form.price) : null,
        free_from: form.free_from ? parseFloat(form.free_from) : null,
        currency: form.currency,
        notes: form.notes || null,
        checked_at: new Date().toISOString(),
      }
      if (existing?.id) {
        const { error } = await supabase.from('competitor_prices').update(payload).eq('id', existing.id)
        if (error) throw error
        toast.success('Aktualizováno')
      } else {
        const { error } = await supabase.from('competitor_prices').insert(payload)
        if (error) throw error
        toast.success('Přidáno')
      }
      router.refresh()
      onClose()
    } catch (e) {
      toast.error('Chyba při ukládání')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!existing?.id) return
    setSaving(true)
    try {
      await supabase.from('competitor_prices').delete().eq('id', existing.id)
      toast.success('Smazáno')
      router.refresh()
      onClose()
    } catch { toast.error('Chyba') } finally { setSaving(false) }
  }

  const selectedCountry = countries.find(c => c.id === form.country_id)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">{existing ? 'Upravit' : 'Přidat'} cenu konkurenta</DialogTitle>
          <p className="text-[10px] text-gray-400">Zadejte cenu za dopravu jakou konkurent účtuje zákazníkovi (s DPH)</p>
        </DialogHeader>

        <div className="space-y-3">
          {/* Country */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Země</Label>
              <Select value={form.country_id} onValueChange={v => onCountryChange(v ?? '')}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue>
                    {selectedCountry ? `${selectedCountry.flag} ${selectedCountry.code}` : 'Vyberte zemi'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {countries.filter(c => c.code !== 'COM').map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.flag} {c.name} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Dopravce</Label>
              <Select value={form.carrier_name} onValueChange={v => onCarrierChange(v ?? 'GLS')}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue>
                    {KNOWN_CARRIERS.find(c => c.name === form.carrier_name)?.label ?? form.carrier_name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {KNOWN_CARRIERS.map(c => (
                    <SelectItem key={c.name} value={c.name}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Custom carrier label (if OTHER) */}
          {form.carrier_name === 'OTHER' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Název dopravce</Label>
              <Input className="h-8 text-xs" placeholder="např. Hermes, Colissimo..." value={form.carrier_label} onChange={e => upd('carrier_label', e.target.value)} />
            </div>
          )}

          {/* E-shop */}
          <div className="space-y-1.5">
            <Label className="text-xs">Název e-shopu</Label>
            <Input className="h-8 text-xs" placeholder="např. Zalando" value={form.competitor_name} onChange={e => upd('competitor_name', e.target.value)} />
          </div>

          {/* URL */}
          <div className="space-y-1.5">
            <Label className="text-xs">URL zdroje (volitelné)</Label>
            <Input className="h-8 text-xs" placeholder="https://..." value={form.competitor_url} onChange={e => upd('competitor_url', e.target.value)} />
          </div>

          {/* Delivery type + currency */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Typ doručení</Label>
              <Select value={form.delivery_type} onValueChange={v => upd('delivery_type', v as 'home' | 'pickup')}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">Domů (kurýr)</SelectItem>
                  <SelectItem value="pickup">Výdejní místo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Měna</Label>
              <Input className="h-8 text-xs" value={form.currency} onChange={e => upd('currency', e.target.value)} />
            </div>
          </div>

          {/* Price + free from */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Cena dopravy ({form.currency})</Label>
              <Input type="number" step="0.01" className="h-8 text-xs" placeholder="0 = zdarma" value={form.price} onChange={e => upd('price', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Zdarma od ({form.currency})</Label>
              <Input type="number" step="0.01" className="h-8 text-xs" placeholder="prázdné = vždy platí" value={form.free_from} onChange={e => upd('free_from', e.target.value)} />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Poznámka</Label>
            <Input className="h-8 text-xs" placeholder="volitelně..." value={form.notes} onChange={e => upd('notes', e.target.value)} />
          </div>
        </div>

        <DialogFooter className="flex !justify-between mt-2">
          {existing ? (
            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={remove} disabled={saving}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Smazat
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Zrušit</Button>
            <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Ukládám…' : 'Uložit'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MarketDashboard({ countries, ourRoutes, competitorPrices }: MarketDashboardProps) {
  const [filterCountry, setFilterCountry] = useState('all')
  const [filterCarrier, setFilterCarrier] = useState('all')
  const [addDialog, setAddDialog] = useState<{ countryId?: string; carrierName?: string } | null>(null)
  const [editItem, setEditItem] = useState<CompetitorPrice | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Group competitor prices: country_id × carrier_name × delivery_type → []
  const compMap = useMemo(() => {
    const map = new Map<string, CompetitorPrice[]>()
    for (const cp of competitorPrices) {
      const key = `${cp.country_id}|${cp.carrier_name ?? 'OTHER'}|${cp.delivery_type}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(cp)
    }
    return map
  }, [competitorPrices])

  // Unique carriers in our routes
  const ourCarriers = useMemo(() => [...new Set(ourRoutes.map(r => r.carrier_code))].sort(), [ourRoutes])

  // Filter routes by carrier
  const filteredRoutes = useMemo(() => {
    return ourRoutes.filter(r => {
      if (filterCarrier !== 'all' && r.carrier_code !== filterCarrier) return false
      return true
    })
  }, [ourRoutes, filterCarrier])

  // Group by country
  const byCountry = useMemo(() => {
    const map = new Map<string, { country: Country; routes: OurRoute[] }>()
    for (const r of filteredRoutes) {
      const country = countries.find(c => c.id === r.country_id)
      if (!country) continue
      if (filterCountry !== 'all' && country.code !== filterCountry) continue
      if (!map.has(country.id)) map.set(country.id, { country, routes: [] })
      map.get(country.id)!.routes.push(r)
    }
    return Array.from(map.values()).sort((a, b) => a.country.code.localeCompare(b.country.code))
  }, [filteredRoutes, countries, filterCountry])

  // Summary stats
  const stats = useMemo(() => {
    let cheapest = 0, belowAvg = 0, average = 0, aboveAvg = 0, mostExpensive = 0
    for (const { country, routes } of byCountry) {
      for (const r of routes) {
        const key = `${country.id}|${r.carrier_code}|${r.delivery_type}`
        const comps = compMap.get(key) ?? []
        const prices = comps.map(c => c.price ?? 0).filter(p => p >= 0)
        if (prices.length === 0) continue
        const pos = getPosition(r.price, prices)
        if (pos === 'cheapest') cheapest++
        else if (pos === 'below_avg') belowAvg++
        else if (pos === 'average') average++
        else if (pos === 'above_avg') aboveAvg++
        else if (pos === 'most_expensive') mostExpensive++
      }
    }
    return { cheapest, belowAvg, average, aboveAvg, mostExpensive }
  }, [byCountry, compMap])

  return (
    <div className="space-y-4">

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Country */}
        <Select value={filterCountry} onValueChange={v => setFilterCountry(v ?? 'all')}>
          <SelectTrigger className="h-8 w-44 text-xs border-gray-200">
            <SelectValue>
              {filterCountry === 'all' ? 'Všechny země' : (() => {
                const c = countries.find(c => c.code === filterCountry)
                return c
                  ? <span className="flex items-center gap-1.5"><FlagImage code={c.code} /> {c.name}</span>
                  : filterCountry
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny země</SelectItem>
            {countries.filter(c => c.code !== 'COM').map(c => (
              <SelectItem key={c.id} value={c.code}>
                <span className="flex items-center gap-1.5"><FlagImage code={c.code} /> {c.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Carrier filter */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[11px]">
          {['all', ...ourCarriers].map(c => (
            <button
              key={c}
              onClick={() => setFilterCarrier(c)}
              className={cn('px-3 py-1.5 font-medium transition-colors border-r border-gray-200 last:border-0',
                filterCarrier === c ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}
            >
              {c === 'all' ? 'Všichni' : c}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setAddDialog({})}>
            <Plus className="h-3 w-3" /> Přidat konkurenta
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {[
          { label: 'Nejlevnější', count: stats.cheapest, cls: 'bg-blue-50 border-blue-200 text-blue-700' },
          { label: 'Pod průměrem', count: stats.belowAvg, cls: 'bg-green-50 border-green-200 text-green-700' },
          { label: 'Průměr', count: stats.average, cls: 'bg-gray-50 border-gray-200 text-gray-600' },
          { label: 'Nad průměrem', count: stats.aboveAvg, cls: 'bg-amber-50 border-amber-200 text-amber-700' },
          { label: 'Nejdražší', count: stats.mostExpensive, cls: 'bg-red-50 border-red-200 text-red-700' },
        ].map(s => (
          <div key={s.label} className={cn('rounded-xl border px-3 py-2.5 text-center', s.cls)}>
            <div className="text-xl font-black">{s.count}</div>
            <div className="text-[9px] font-semibold uppercase tracking-wider mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Country sections */}
      {byCountry.map(({ country, routes }) => (
        <div key={country.id} className="space-y-2">
          {/* Country header */}
          <div className="flex items-center gap-2 px-1">
            <FlagImage code={country.code} />
            <span className="text-sm font-bold text-gray-800">{country.name}</span>
            <div className="h-px flex-1 bg-gray-100" />
          </div>

          {/* Route cards — one per carrier × delivery_type */}
          {routes.map(route => {
            const key = `${country.id}|${route.carrier_code}|${route.delivery_type}`
            const comps = compMap.get(key) ?? []
            const prices = comps.map(c => c.price ?? 0).filter(p => p >= 0)
            const pos = getPosition(route.price, prices)
            const avg = prices.length > 0 ? prices.reduce((s, p) => s + p, 0) / prices.length : 0
            const min = prices.length > 0 ? Math.min(...prices) : 0
            const max = prices.length > 0 ? Math.max(...prices) : 0
            const isExp = expanded === key
            const carrierCls = CARRIER_COLORS[route.carrier_code] ?? 'bg-gray-100 text-gray-700 border-gray-200'

            return (
              <Card key={key} className="border border-gray-200/80 shadow-sm overflow-hidden">
                {/* Header row */}
                <div
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                  onClick={() => setExpanded(isExp ? null : key)}
                >
                  {/* Carrier + delivery type badge */}
                  <Badge variant="outline" className={cn('text-[10px] font-bold px-2 py-0.5 h-5 shrink-0', carrierCls)}>
                    {route.carrier_code}
                  </Badge>
                  <span className="flex items-center gap-1 text-[11px] text-gray-500">
                    {route.delivery_type === 'home'
                      ? <><Home className="h-3 w-3" /> Domů</>
                      : <><Package className="h-3 w-3" /> Výdejní místo</>}
                    {route.service_name && <span className="text-gray-400">· {route.service_name}</span>}
                  </span>

                  <div className="h-3 w-px bg-gray-200" />

                  {/* Our price */}
                  <div className="flex items-baseline gap-1">
                    <span className="text-[10px] text-gray-400">My:</span>
                    <span className="font-bold text-sm text-gray-900">{formatCurrency(route.price, route.currency)}</span>
                  </div>

                  {/* Market avg */}
                  {prices.length > 0 && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-[10px] text-gray-400">Ø trhu:</span>
                      <span className="text-sm text-gray-600 font-medium">{formatCurrency(avg, route.currency)}</span>
                    </div>
                  )}

                  {/* Price bar */}
                  {prices.length > 0 && (
                    <div className="flex-1 hidden md:block">
                      <PriceBar ourPrice={route.price} competitorPrices={prices} ourPrice2={route.price} />
                    </div>
                  )}

                  <div className="flex items-center gap-2 ml-auto shrink-0">
                    <PositionBadge pos={pos} />
                    <Badge variant="outline" className="text-[10px] text-gray-400 border-gray-200 px-1.5 py-0 h-5">
                      {comps.length} {comps.length === 1 ? 'konkurent' : comps.length < 5 ? 'konkurenti' : 'konkurentů'}
                    </Badge>
                    {isExp ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExp && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3 bg-gray-50/30">
                    {/* Recommendation */}
                    <Recommendation
                      pos={pos}
                      ourPrice={route.price}
                      avg={avg} min={min} max={max}
                      canIncrease={avg - route.price}
                      currency={route.currency}
                    />

                    {/* Table */}
                    <div className="rounded-lg border border-gray-200 overflow-x-auto bg-white">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2">E-shop</th>
                            <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2">Dopravce</th>
                            <th className="text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2">Cena dopravy</th>
                            <th className="text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2">Zdarma od</th>
                            <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2">Poznámka</th>
                            <th className="text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2">Datum</th>
                            <th className="w-8 px-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {/* Our row */}
                          <tr className="bg-blue-50/50">
                            <td className="px-3 py-2 font-bold text-blue-700">
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                                MY
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 h-4', carrierCls)}>{route.carrier_code}</Badge>
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-blue-700">
                              {formatCurrency(route.price, route.currency)}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-400">—</td>
                            <td className="px-3 py-2 text-gray-400 text-[10px]">{route.service_name}</td>
                            <td className="px-3 py-2 text-right text-gray-300 text-[10px]">aktuální</td>
                            <td />
                          </tr>

                          {comps.length === 0 && (
                            <tr>
                              <td colSpan={7} className="px-3 py-4 text-center text-gray-400 text-[11px]">
                                Žádná data konkurence.{' '}
                                <button
                                  className="text-blue-500 hover:underline"
                                  onClick={() => setAddDialog({ countryId: country.id, carrierName: route.carrier_code })}
                                >
                                  Přidat
                                </button>
                              </td>
                            </tr>
                          )}

                          {comps.sort((a, b) => (a.price ?? 0) - (b.price ?? 0)).map(comp => {
                            const isCheaper = comp.price != null && comp.price < route.price
                            const isMoreExp = comp.price != null && comp.price > route.price
                            return (
                              <tr key={comp.id} className="hover:bg-gray-50/60 group">
                                <td className="px-3 py-2 font-medium text-gray-700">
                                  <div className="flex items-center gap-1.5">
                                    <div className={cn('w-2 h-2 rounded-full shrink-0',
                                      isCheaper ? 'bg-green-400' : isMoreExp ? 'bg-red-400' : 'bg-gray-300')} />
                                    {comp.competitor_name}
                                    {comp.competitor_url && (
                                      <a href={comp.competitor_url} target="_blank" rel="noreferrer"
                                        className="text-gray-300 hover:text-blue-500"
                                        onClick={e => e.stopPropagation()}>
                                        <ExternalLink className="h-2.5 w-2.5" />
                                      </a>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-[10px] text-gray-500">
                                  {comp.carrier_label ?? comp.carrier_name}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {comp.price != null ? (
                                    <span className={cn('font-semibold',
                                      isCheaper ? 'text-green-600' : isMoreExp ? 'text-red-600' : 'text-gray-700')}>
                                      {comp.price === 0 ? 'Zdarma' : formatCurrency(comp.price, comp.currency as Currency)}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-400 text-[11px]">
                                  {comp.free_from ? formatCurrency(comp.free_from, comp.currency as Currency) : '—'}
                                </td>
                                <td className="px-3 py-2 text-gray-400 text-[10px]">{comp.notes}</td>
                                <td className="px-3 py-2 text-right text-[10px] text-gray-300">
                                  {new Date(comp.checked_at).toLocaleDateString('cs-CZ')}
                                </td>
                                <td className="px-2 py-2">
                                  <button
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 transition-opacity"
                                    onClick={e => { e.stopPropagation(); setEditItem(comp) }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex justify-end">
                      <Button size="sm" variant="ghost" className="h-7 text-[11px] text-blue-500 hover:text-blue-700 gap-1"
                        onClick={() => setAddDialog({ countryId: country.id, carrierName: route.carrier_code })}>
                        <Plus className="h-3 w-3" /> Přidat konkurenta pro {route.carrier_code} · {country.code}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      ))}

      {byCountry.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          Žádné aktivní trasy pro zvolený filtr.
        </div>
      )}

      {/* Dialogs */}
      {addDialog !== null && (
        <CompetitorDialog
          countries={countries}
          presetCountryId={addDialog.countryId}
          presetCarrierName={addDialog.carrierName}
          onClose={() => setAddDialog(null)}
        />
      )}
      {editItem && (
        <CompetitorDialog countries={countries} existing={editItem} onClose={() => setEditItem(null)} />
      )}
    </div>
  )
}

// ─── Price bar ────────────────────────────────────────────────────────────────

function PriceBar({ ourPrice, competitorPrices: prices }: {
  ourPrice: number; competitorPrices: number[]; ourPrice2: number
}) {
  if (prices.length === 0) return null
  const all = [...prices, ourPrice]
  const min = Math.min(...all) * 0.85
  const max = Math.max(...all) * 1.15
  const range = max - min
  const pct = (p: number) => Math.max(2, Math.min(98, ((p - min) / range) * 100))

  return (
    <div className="relative h-4 flex items-center px-2">
      <div className="w-full h-1.5 bg-gray-200 rounded-full relative">
        {prices.map((p, i) => (
          <div key={i} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gray-400"
            style={{ left: `${pct(p)}%` }} />
        ))}
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-blue-600 border-2 border-white shadow z-10"
          style={{ left: `${pct(ourPrice)}%` }} />
      </div>
    </div>
  )
}
