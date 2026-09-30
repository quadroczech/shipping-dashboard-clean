'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, ExternalLink, Fuel, Route, CreditCard, ChevronDown, ChevronUp } from 'lucide-react'
import { CarrierBadge } from '@/components/ui/carrier-badge'
import { FlagImage } from '@/components/ui/flag-image'
import type { Carrier, CarrierSurcharge, Surcharge, CountryCarrier } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

// Only these main carriers appear in the surcharge manager
const MAIN_CARRIER_CODES = ['PPL', 'GLS', 'PACKETA', 'SLOVENSKA_POSTA', 'CESKA_POSTA', 'DPD']

interface Props {
  carriers: Carrier[]
  carrierSurcharges: CarrierSurcharge[]
  codSurcharges: Surcharge[]
  countryCarriers: CountryCarrier[]
}

// ─── Fuel/Toll form ───────────────────────────────────────────────────────────

type FuelForm = {
  carrier_id: string
  type: 'fuel' | 'toll'
  value: string
  is_percentage: boolean
  is_per_kg: boolean
  valid_from: string
  valid_to: string
  source_url: string
}

const EMPTY_FUEL: FuelForm = {
  carrier_id: '',
  type: 'fuel',
  value: '',
  is_percentage: true,
  is_per_kg: false,
  valid_from: new Date().toISOString().split('T')[0],
  valid_to: '',
  source_url: '',
}

// ─── COD form ─────────────────────────────────────────────────────────────────

type CodForm = {
  country_carrier_id: string
  type: 'cod' | 'cod_card'
  value: string
  currency: string
  valid_from: string
  valid_to: string
}

const EMPTY_COD: CodForm = {
  country_carrier_id: '',
  type: 'cod',
  value: '',
  currency: 'CZK',
  valid_from: new Date().toISOString().split('T')[0],
  valid_to: '',
}

const TYPE_LABELS: Record<'fuel' | 'toll', string> = {
  fuel: 'Palivový příplatek',
  toll: 'Mýtný příplatek',
}

const COD_CURRENCIES = ['CZK', 'EUR', 'HUF', 'RON', 'PLN', 'CHF', 'DKK', 'SEK']

export function CarrierSurchargeManager({ carriers, carrierSurcharges, codSurcharges, countryCarriers }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const mainCarriers = useMemo(
    () => carriers.filter((c) => MAIN_CARRIER_CODES.includes(c.code))
      .sort((a, b) => MAIN_CARRIER_CODES.indexOf(a.code) - MAIN_CARRIER_CODES.indexOf(b.code)),
    [carriers]
  )

  // ── History expand state (key = `${carrierId}__${type}`) ────────────────────
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set())
  function toggleHistory(key: string) {
    setExpandedHistory((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // ── Fuel/toll state ──────────────────────────────────────────────────────────
  const [fuelDialogOpen, setFuelDialogOpen] = useState(false)
  const [fuelEditId, setFuelEditId] = useState<string | null>(null)
  const [fuelForm, setFuelForm] = useState<FuelForm>(EMPTY_FUEL)
  const [fuelSaving, setFuelSaving] = useState(false)

  // ── COD state ────────────────────────────────────────────────────────────────
  const [codDialogOpen, setCodDialogOpen] = useState(false)
  const [codEditId, setCodEditId] = useState<string | null>(null)
  const [codForm, setCodForm] = useState<CodForm>(EMPTY_COD)
  const [codSaving, setCodSaving] = useState(false)

  // Group carrier surcharges by carrier_id
  const surchargesByCarrier = useMemo(() => {
    const map = new Map<string, { fuel: CarrierSurcharge[]; toll: CarrierSurcharge[] }>()
    for (const c of mainCarriers) map.set(c.id, { fuel: [], toll: [] })
    for (const s of carrierSurcharges) {
      const entry = map.get(s.carrier_id)
      if (!entry) continue
      if (s.type === 'fuel') entry.fuel.push(s)
      else entry.toll.push(s)
    }
    for (const entry of map.values()) {
      entry.fuel.sort((a, b) => b.valid_from.localeCompare(a.valid_from))
      entry.toll.sort((a, b) => b.valid_from.localeCompare(a.valid_from))
    }
    return map
  }, [mainCarriers, carrierSurcharges])

  // Group COD surcharges by carrier code → country rows
  const codByCarrier = useMemo(() => {
    const map = new Map<string, Surcharge[]>()
    for (const s of codSurcharges) {
      const code = s.country_carrier?.carrier?.code
      if (!code || !MAIN_CARRIER_CODES.includes(code)) continue
      if (!map.has(code)) map.set(code, [])
      map.get(code)!.push(s)
    }
    return map
  }, [codSurcharges])

  function isActive(s: CarrierSurcharge) {
    return s.valid_from <= today && (s.valid_to == null || s.valid_to >= today)
  }

  // ── Fuel/toll handlers ───────────────────────────────────────────────────────

  function openFuelNew(carrierId?: string, type?: 'fuel' | 'toll') {
    setFuelEditId(null)
    setFuelForm({ ...EMPTY_FUEL, carrier_id: carrierId ?? '', type: type ?? 'fuel' })
    setFuelDialogOpen(true)
  }

  function openFuelEdit(s: CarrierSurcharge) {
    setFuelEditId(s.id)
    setFuelForm({
      carrier_id: s.carrier_id,
      type: s.type,
      value: String(s.value),
      is_percentage: s.is_percentage,
      is_per_kg: s.is_per_kg,
      valid_from: s.valid_from,
      valid_to: s.valid_to ?? '',
      source_url: s.source_url ?? '',
    })
    setFuelDialogOpen(true)
  }

  async function handleFuelSave() {
    if (!fuelForm.carrier_id || !fuelForm.value || !fuelForm.valid_from) {
      toast.error('Vyplňte dopravce, hodnotu a datum platnosti od')
      return
    }
    setFuelSaving(true)
    try {
      const payload = {
        carrier_id: fuelForm.carrier_id,
        type: fuelForm.type,
        value: parseFloat(fuelForm.value),
        is_percentage: fuelForm.is_percentage,
        is_per_kg: fuelForm.is_per_kg,
        valid_from: fuelForm.valid_from,
        valid_to: fuelForm.valid_to || null,
        source_url: fuelForm.source_url || null,
      }
      if (fuelEditId) {
        const { error } = await supabase.from('carrier_surcharges').update(payload).eq('id', fuelEditId)
        if (error) throw error
        toast.success('Příplatek upraven')
      } else {
        const { error } = await supabase.from('carrier_surcharges').insert(payload)
        if (error) throw error
        toast.success('Příplatek přidán')
      }
      setFuelDialogOpen(false)
      router.refresh()
    } catch (e) {
      toast.error(`Chyba: ${e instanceof Error ? e.message : 'Neznámá chyba'}`)
    } finally {
      setFuelSaving(false)
    }
  }

  async function handleFuelDelete(id: string) {
    if (!confirm('Smazat tento záznam?')) return
    const { error } = await supabase.from('carrier_surcharges').delete().eq('id', id)
    if (error) { toast.error('Chyba při mazání'); return }
    toast.success('Smazáno')
    router.refresh()
  }

  // ── COD handlers ─────────────────────────────────────────────────────────────

  function openCodNew(carrierId?: string) {
    setCodEditId(null)
    const cc = carrierId
      ? countryCarriers.find((cc) => cc.carrier?.id === carrierId)
      : undefined
    setCodForm({ ...EMPTY_COD, country_carrier_id: cc?.id ?? '' })
    setCodDialogOpen(true)
  }

  function openCodEdit(s: Surcharge) {
    setCodEditId(s.id)
    setCodForm({
      country_carrier_id: s.country_carrier_id,
      type: s.type as 'cod' | 'cod_card',
      value: String(s.value),
      currency: s.currency ?? 'CZK',
      valid_from: s.valid_from,
      valid_to: s.valid_to ?? '',
    })
    setCodDialogOpen(true)
  }

  async function handleCodSave() {
    if (!codForm.country_carrier_id || !codForm.value || !codForm.valid_from) {
      toast.error('Vyplňte trasu, hodnotu a datum platnosti od')
      return
    }
    setCodSaving(true)
    try {
      const payload = {
        country_carrier_id: codForm.country_carrier_id,
        type: codForm.type,
        value: parseFloat(codForm.value),
        is_percentage: false,
        is_per_kg: false,
        currency: codForm.currency,
        valid_from: codForm.valid_from,
        valid_to: codForm.valid_to || null,
        label: null,
        source_url: null,
        auto_updated: false,
      }
      if (codEditId) {
        const { error } = await supabase.from('surcharges').update(payload).eq('id', codEditId)
        if (error) throw error
        toast.success('Dobírka upravena')
      } else {
        const { error } = await supabase.from('surcharges').insert(payload)
        if (error) throw error
        toast.success('Dobírka přidána')
      }
      setCodDialogOpen(false)
      router.refresh()
    } catch (e) {
      toast.error(`Chyba: ${e instanceof Error ? e.message : 'Neznámá chyba'}`)
    } finally {
      setCodSaving(false)
    }
  }

  async function handleCodDelete(id: string) {
    if (!confirm('Smazat tento záznam dobírky?')) return
    const { error } = await supabase.from('surcharges').delete().eq('id', id)
    if (error) { toast.error('Chyba při mazání'); return }
    toast.success('Smazáno')
    router.refresh()
  }

  // Country carriers for COD dialog — only main carriers, grouped nicely
  const codCountryCarrierOptions = useMemo(() => {
    return countryCarriers
      .filter((cc) => cc.carrier && MAIN_CARRIER_CODES.includes(cc.carrier.code) && cc.country)
      .sort((a, b) => {
        const ca = a.carrier!.code, cb = b.carrier!.code
        if (ca !== cb) return MAIN_CARRIER_CODES.indexOf(ca) - MAIN_CARRIER_CODES.indexOf(cb)
        return a.country!.code.localeCompare(b.country!.code)
      })
  }, [countryCarriers])

  return (
    <div className="space-y-6">
      {/* ── Fuel & Toll ───────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <Fuel className="h-3.5 w-3.5 text-amber-500" /> Palivový a mýtný příplatek
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Platí jednotně pro dopravce ve všech zemích. Trasy s fixní cenou jsou automaticky vyjmuty.</p>
          </div>
          <Button size="sm" onClick={() => openFuelNew()} className="gap-1.5 h-8 text-xs">
            <Plus className="h-3.5 w-3.5" /> Přidat
          </Button>
        </div>

        <div className="space-y-3">
          {mainCarriers.map((carrier) => {
            const { fuel, toll } = surchargesByCarrier.get(carrier.id) ?? { fuel: [], toll: [] }
            return (
              <Card key={carrier.id} className="border-0 shadow-sm">
                <CardHeader className="pb-1.5 pt-3.5 px-4">
                  <div className="flex items-center justify-between">
                    <CarrierBadge carrier={carrier} />
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => openFuelNew(carrier.id, 'fuel')}>
                        <Fuel className="h-3 w-3" /> + Palivo
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => openFuelNew(carrier.id, 'toll')}>
                        <Route className="h-3 w-3" /> + Mýto
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {fuel.length === 0 && toll.length === 0 && (
                    <p className="text-xs text-gray-400 italic">Žádné záznamy</p>
                  )}
                  {[{ type: 'fuel' as const, label: 'Palivo', records: fuel },
                    { type: 'toll' as const, label: 'Mýto', records: toll }]
                    .filter((g) => g.records.length > 0)
                    .map(({ type, label, records }) => {
                      const histKey = `${carrier.id}__${type}`
                      const showHistory = expandedHistory.has(histKey)
                      const current = records[0]
                      const historical = records.slice(1)
                      const renderRow = (s: CarrierSurcharge) => {
                        const active = isActive(s)
                        const linkUrl = s.source_url ?? carrier.fuel_surcharge_url ?? null
                        return (
                          <div key={s.id} className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-xs',
                            active ? 'bg-amber-50 border border-amber-200/60' : 'bg-gray-50 border border-gray-100'
                          )}>
                            {active && <Badge className="bg-amber-500 text-white text-[9px] px-1.5 py-0 h-4 shrink-0">aktivní</Badge>}
                            <span className={cn('font-black text-base shrink-0', active ? 'text-amber-800' : 'text-gray-400')}>
                              {s.is_percentage ? `${s.value}%` : `${s.value}${s.is_per_kg ? '/kg' : ''}`}
                            </span>
                            <span className="text-gray-400 shrink-0">
                              od <span className="font-medium text-gray-600">{s.valid_from}</span>
                              {s.valid_to && <> do <span className="font-medium text-gray-600">{s.valid_to}</span></>}
                            </span>
                            <div className="flex items-center gap-1 ml-auto">
                              {linkUrl && (
                                <a href={linkUrl} target="_blank" rel="noreferrer" className="p-1 rounded text-gray-400 hover:text-gray-600">
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                              <button onClick={() => openFuelEdit(s)} className="p-1 rounded text-gray-400 hover:text-blue-600">
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button onClick={() => handleFuelDelete(s.id)} className="p-1 rounded text-gray-400 hover:text-red-600">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        )
                      }
                      return (
                        <div key={type}>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</p>
                          <div className="space-y-1">
                            {renderRow(current)}
                            {historical.length > 0 && (
                              <>
                                <button
                                  onClick={() => toggleHistory(histKey)}
                                  className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors pl-1 pt-0.5"
                                >
                                  {showHistory
                                    ? <><ChevronUp className="h-3 w-3" /> Skrýt historii</>
                                    : <><ChevronDown className="h-3 w-3" /> Historie ({historical.length})</>}
                                </button>
                                {showHistory && (
                                  <div className="space-y-1">
                                    {historical.map(renderRow)}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* ── COD (Dobírka) ─────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5 text-blue-500" /> Dobírka
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Poplatek dopravci za zásilku zaslanou na dobírku — dle země a dopravce.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => openCodNew()} className="gap-1.5 h-8 text-xs">
            <Plus className="h-3.5 w-3.5" /> Přidat dobírku
          </Button>
        </div>

        <div className="space-y-3">
          {mainCarriers.map((carrier) => {
            const rows = codByCarrier.get(carrier.code) ?? []
            if (rows.length === 0) return null
            return (
              <Card key={carrier.id} className="border-0 shadow-sm">
                <CardHeader className="pb-1 pt-3 px-4">
                  <div className="flex items-center justify-between">
                    <CarrierBadge carrier={carrier} />
                    <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => openCodNew(carrier.id)}>
                      <Plus className="h-3 w-3" /> Přidat
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-0 pb-0 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="px-4 py-2 text-left font-medium text-gray-400 text-[10px] uppercase">Země</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-400 text-[10px] uppercase">Typ</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-400 text-[10px] uppercase">Částka</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-400 text-[10px] uppercase">Platnost od</th>
                        <th className="px-4 py-2 w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows
                        .sort((a, b) => (a.country_carrier?.country?.code ?? '').localeCompare(b.country_carrier?.country?.code ?? ''))
                        .map((s) => (
                          <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                            <td className="px-4 py-2">
                              <span className="flex items-center gap-1.5">
                                <FlagImage code={s.country_carrier?.country?.code ?? ''} />
                                <span className="font-semibold text-gray-700">{s.country_carrier?.country?.code}</span>
                              </span>
                            </td>
                            <td className="px-4 py-2 text-gray-500">
                              {s.type === 'cod' ? 'Hotovost' : 'Karta'}
                            </td>
                            <td className="px-4 py-2 text-right font-semibold text-gray-800">
                              {s.value} {s.currency}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-400">{s.valid_from}</td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => openCodEdit(s)} className="p-1 rounded text-gray-400 hover:text-blue-600">
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button onClick={() => handleCodDelete(s.id)} className="p-1 rounded text-gray-400 hover:text-red-600">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* ── Fuel/Toll Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={fuelDialogOpen} onOpenChange={setFuelDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{fuelEditId ? 'Upravit příplatek' : 'Nový příplatek'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Dopravce</Label>
              <Select value={fuelForm.carrier_id} onValueChange={(v) => setFuelForm((f) => ({ ...f, carrier_id: v ?? '' }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Vyberte dopravce" /></SelectTrigger>
                <SelectContent>
                  {mainCarriers.map((c) => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Typ</Label>
              <Select value={fuelForm.type} onValueChange={(v) => setFuelForm((f) => ({ ...f, type: v as 'fuel' | 'toll' }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Hodnota</Label>
                <Input type="number" step="0.01" min="0" value={fuelForm.value}
                  onChange={(e) => setFuelForm((f) => ({ ...f, value: e.target.value }))}
                  className="h-8 text-xs" placeholder="18.8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Jednotka</Label>
                <Select value={fuelForm.is_percentage ? 'pct' : 'fixed'} onValueChange={(v) => setFuelForm((f) => ({ ...f, is_percentage: v === 'pct' }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pct" className="text-xs">% ze základní ceny</SelectItem>
                    <SelectItem value="fixed" className="text-xs">Pevná částka</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Platnost od</Label>
                <Input type="date" value={fuelForm.valid_from}
                  onChange={(e) => setFuelForm((f) => ({ ...f, valid_from: e.target.value }))}
                  className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Platnost do</Label>
                <Input type="date" value={fuelForm.valid_to}
                  onChange={(e) => setFuelForm((f) => ({ ...f, valid_to: e.target.value }))}
                  className="h-8 text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">URL zdroje (volitelné)</Label>
              <Input type="url" value={fuelForm.source_url}
                onChange={(e) => setFuelForm((f) => ({ ...f, source_url: e.target.value }))}
                className="h-8 text-xs" placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFuelDialogOpen(false)} className="text-xs h-8">Zrušit</Button>
            <Button size="sm" onClick={handleFuelSave} disabled={fuelSaving} className="text-xs h-8">
              {fuelSaving ? 'Ukládám…' : 'Uložit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── COD Dialog ────────────────────────────────────────────────────────── */}
      <Dialog open={codDialogOpen} onOpenChange={setCodDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{codEditId ? 'Upravit dobírku' : 'Nová dobírka'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Dopravce + Země</Label>
              <Select value={codForm.country_carrier_id} onValueChange={(v) => setCodForm((f) => ({ ...f, country_carrier_id: v ?? '' }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Vyberte trasu" /></SelectTrigger>
                <SelectContent>
                  {codCountryCarrierOptions.map((cc) => (
                    <SelectItem key={cc.id} value={cc.id} className="text-xs">
                      {cc.carrier?.name} — {cc.country?.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Typ dobírky</Label>
              <Select value={codForm.type} onValueChange={(v) => setCodForm((f) => ({ ...f, type: v as 'cod' | 'cod_card' }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cod" className="text-xs">Hotovost</SelectItem>
                  <SelectItem value="cod_card" className="text-xs">Karta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Částka</Label>
                <Input type="number" step="0.01" min="0" value={codForm.value}
                  onChange={(e) => setCodForm((f) => ({ ...f, value: e.target.value }))}
                  className="h-8 text-xs" placeholder="39" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Měna</Label>
                <Select value={codForm.currency} onValueChange={(v) => setCodForm((f) => ({ ...f, currency: v ?? 'CZK' }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COD_CURRENCIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Platnost od</Label>
                <Input type="date" value={codForm.valid_from}
                  onChange={(e) => setCodForm((f) => ({ ...f, valid_from: e.target.value }))}
                  className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Platnost do</Label>
                <Input type="date" value={codForm.valid_to}
                  onChange={(e) => setCodForm((f) => ({ ...f, valid_to: e.target.value }))}
                  className="h-8 text-xs" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCodDialogOpen(false)} className="text-xs h-8">Zrušit</Button>
            <Button size="sm" onClick={handleCodSave} disabled={codSaving} className="text-xs h-8">
              {codSaving ? 'Ukládám…' : 'Uložit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
