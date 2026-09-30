'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Plus, Pencil, Trash2, ExternalLink, Fuel, Zap } from 'lucide-react'
import type { Surcharge, CountryCarrier, SurchargeType, Carrier } from '@/types'
import { SURCHARGE_TYPE_LABELS } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { cs } from 'date-fns/locale'

interface SurchargeManagerProps {
  surcharges: Surcharge[]
  countryCarriers: CountryCarrier[]
  carriers: Carrier[]
}

type FormState = {
  country_carrier_id: string
  type: SurchargeType
  label: string
  value: string
  is_percentage: boolean
  currency: string
  valid_from: string
  valid_to: string
  source_url: string
}

const EMPTY_FORM: FormState = {
  country_carrier_id: '',
  type: 'fuel',
  label: '',
  value: '',
  is_percentage: true,
  currency: '',
  valid_from: new Date().toISOString().split('T')[0],
  valid_to: '',
  source_url: '',
}

const SURCHARGE_TYPES: SurchargeType[] = ['fuel', 'toll', 'cod', 'cod_card', 'address_delivery', 'remote_area', 'oversize', 'other']

type BulkForm = {
  carrierCode: string
  value: string
  valid_from: string
  close_previous: boolean
}

const EMPTY_BULK: BulkForm = {
  carrierCode: '',
  value: '',
  valid_from: '',
  close_previous: true,
}

export function SurchargeManager({ surcharges, countryCarriers, carriers }: SurchargeManagerProps) {
  const router = useRouter()
  const supabase = createClient()
  const [filterCarrier, setFilterCarrier] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [bulkForm, setBulkForm] = useState<BulkForm>(EMPTY_BULK)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Unique carriers from country_carriers (for filter dropdown)
  const carrierOptions = useMemo(() => {
    const map = new Map<string, { code: string; name: string; color: string }>()
    countryCarriers.forEach((cc) => {
      if (cc.carrier) map.set(cc.carrier.code, { code: cc.carrier.code, name: cc.carrier.name, color: cc.carrier.logo_color })
    })
    return Array.from(map.values())
  }, [countryCarriers])

  // Group surcharges by carrier for easy viewing
  const filtered = useMemo(() => {
    return surcharges.filter((s) => {
      const carrierCode = s.country_carrier?.carrier?.code
      if (filterCarrier !== 'all' && carrierCode !== filterCarrier) return false
      if (filterType !== 'all' && s.type !== filterType) return false
      return true
    })
  }, [surcharges, filterCarrier, filterType])

  // Group by carrier
  const grouped = useMemo(() => {
    const map = new Map<string, { carrier: { code: string; name: string; color: string; fuel_surcharge_url?: string | null }; items: Surcharge[] }>()
    filtered.forEach((s) => {
      const code = s.country_carrier?.carrier?.code ?? 'unknown'
      if (!map.has(code)) {
        map.set(code, {
          carrier: {
            code,
            name: s.country_carrier?.carrier?.name ?? code,
            color: s.country_carrier?.carrier?.logo_color ?? '#666',
            fuel_surcharge_url: s.country_carrier?.carrier?.fuel_surcharge_url,
          },
          items: [],
        })
      }
      map.get(code)!.items.push(s)
    })
    return Array.from(map.values())
  }, [filtered])

  function openNew() {
    setForm(EMPTY_FORM)
    setEditId(null)
    setDialogOpen(true)
  }

  function openEdit(s: Surcharge) {
    setForm({
      country_carrier_id: s.country_carrier_id,
      type: s.type as SurchargeType,
      label: s.label ?? '',
      value: String(s.value),
      is_percentage: s.is_percentage,
      currency: s.currency ?? '',
      valid_from: s.valid_from,
      valid_to: s.valid_to ?? '',
      source_url: s.source_url ?? '',
    })
    setEditId(s.id)
    setDialogOpen(true)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('surcharges').delete().eq('id', id)
    if (error) { toast.error('Chyba při mazání'); return }
    toast.success('Příplatek smazán')
    router.refresh()
  }

  async function handleSave() {
    if (!form.country_carrier_id || !form.value) {
      toast.error('Vyplňte povinná pole')
      return
    }
    setSaving(true)
    try {
      const payload = {
        country_carrier_id: form.country_carrier_id,
        type: form.type,
        label: form.label || null,
        value: parseFloat(form.value),
        is_percentage: form.is_percentage,
        currency: form.is_percentage ? null : (form.currency || null),
        valid_from: form.valid_from,
        valid_to: form.valid_to || null,
        source_url: form.source_url || null,
        updated_at: new Date().toISOString(),
      }

      if (editId) {
        const { error } = await supabase.from('surcharges').update(payload).eq('id', editId)
        if (error) throw error
        toast.success('Příplatek aktualizován')
      } else {
        const { error } = await supabase.from('surcharges').insert(payload)
        if (error) throw error
        toast.success('Příplatek přidán')
      }

      setDialogOpen(false)
      router.refresh()
    } catch (err) {
      toast.error('Chyba při ukládání')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleBulkSave() {
    if (!bulkForm.carrierCode || !bulkForm.value || !bulkForm.valid_from) {
      toast.error('Vyplňte všechna pole')
      return
    }
    const newValue = parseFloat(bulkForm.value)
    if (isNaN(newValue) || newValue < 0) {
      toast.error('Neplatná hodnota příplatku')
      return
    }

    setSaving(true)
    try {
      // Find all country_carrier IDs for the selected carrier
      const targetCCs = countryCarriers.filter(
        (cc) => cc.carrier?.code === bulkForm.carrierCode
      )
      if (targetCCs.length === 0) {
        toast.error('Žádné aktivní kombinace pro tohoto dopravce')
        return
      }

      // Optionally close existing fuel surcharges for these country_carriers
      if (bulkForm.close_previous) {
        const validTo = new Date(bulkForm.valid_from)
        validTo.setDate(validTo.getDate() - 1)
        const validToStr = validTo.toISOString().split('T')[0]

        const ccIds = targetCCs.map((cc) => cc.id)
        const { error: closeErr } = await supabase
          .from('surcharges')
          .update({ valid_to: validToStr })
          .in('country_carrier_id', ccIds)
          .eq('type', 'fuel')
          .is('valid_to', null)

        if (closeErr) throw closeErr
      }

      // Insert new fuel surcharges for all country_carriers of this carrier
      const rows = targetCCs.map((cc) => ({
        country_carrier_id: cc.id,
        type: 'fuel' as SurchargeType,
        label: 'Palivový příplatek',
        value: newValue,
        is_percentage: true,
        is_per_kg: false,
        currency: null,
        valid_from: bulkForm.valid_from,
        valid_to: null,
        source_url: null,
        auto_updated: false,
      }))

      const { error: insertErr } = await supabase.from('surcharges').insert(rows)
      if (insertErr) throw insertErr

      toast.success(
        `Palivový příplatek ${newValue}% nastaven pro ${rows.length} tras (${bulkForm.carrierCode})`,
      )
      setBulkDialogOpen(false)
      setBulkForm(EMPTY_BULK)
      router.refresh()
    } catch (err) {
      toast.error('Chyba při ukládání')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <Select value={filterCarrier} onValueChange={(v) => setFilterCarrier(v ?? 'all')}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="Všichni dopravci" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všichni dopravci</SelectItem>
            {carrierOptions.map((c) => (
              <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={(v) => setFilterType(v ?? 'all')}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="Všechny typy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny typy</SelectItem>
            {SURCHARGE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{SURCHARGE_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-8 border-amber-300 text-amber-700 hover:bg-amber-50"
          onClick={() => { setBulkForm(EMPTY_BULK); setBulkDialogOpen(true) }}
        >
          <Zap className="mr-1.5 h-3.5 w-3.5" />
          Hromadná aktualizace paliva
        </Button>
        <Button size="sm" className="h-8" onClick={openNew}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Přidat příplatek
        </Button>
      </div>

      {/* Info card about fuel surcharge */}
      <Card className="border-orange-200 bg-orange-50 border shadow-none">
        <CardContent className="px-4 py-3 flex items-start gap-3">
          <Fuel className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
          <div className="text-xs text-orange-700">
            <span className="font-semibold">Palivový příplatek</span> se u PPL a GLS mění měsíčně nebo kvartálně.
            Vždy zkontrolujte aktuální hodnotu na stránkách dopravce a aktualizujte ji zde. Změna příplatku
            se okamžitě projeví v přepočtu marže na dashboardu.
          </div>
        </CardContent>
      </Card>

      {/* Grouped by carrier */}
      {grouped.length === 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-10 text-center text-sm text-gray-400">
            Žádné příplatky — přidejte první pomocí tlačítka výše
          </CardContent>
        </Card>
      )}

      {grouped.map(({ carrier, items }) => (
        <Card key={carrier.code} className="border-0 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <span
                className="rounded px-2 py-0.5 text-white text-xs font-bold"
                style={{ backgroundColor: carrier.color }}
              >
                {carrier.code}
              </span>
              {carrier.name}
              {carrier.fuel_surcharge_url && (
                <a
                  href={carrier.fuel_surcharge_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-normal ml-auto"
                >
                  <ExternalLink className="h-3 w-3" />
                  Příplatky na webu dopravce
                </a>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left font-medium text-gray-400 px-4 py-2">Typ</th>
                  <th className="text-left font-medium text-gray-400 px-4 py-2">Země</th>
                  <th className="text-right font-medium text-gray-400 px-4 py-2">Hodnota</th>
                  <th className="text-right font-medium text-gray-400 px-4 py-2">Platí od</th>
                  <th className="text-right font-medium text-gray-400 px-4 py-2">Platí do</th>
                  <th className="text-center font-medium text-gray-400 px-4 py-2">Akce</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <Badge
                        variant="outline"
                        className={
                          s.type === 'fuel'
                            ? 'bg-orange-50 border-orange-200 text-orange-700'
                            : s.type === 'toll'
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : s.type === 'cod' || s.type === 'cod_card'
                            ? 'bg-purple-50 border-purple-200 text-purple-700'
                            : 'bg-gray-50 border-gray-200 text-gray-700'
                        }
                      >
                        {s.label ?? SURCHARGE_TYPE_LABELS[s.type as SurchargeType] ?? s.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {s.country_carrier?.country
                        ? `${s.country_carrier.country.flag} ${s.country_carrier.country.code}`
                        : '—'
                      }
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                      {s.is_percentage
                        ? `${s.value} %`
                        : `${s.value} ${s.currency ?? ''}`
                      }
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500">
                      {s.valid_from}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-400">
                      {s.valid_to ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(s)}>
                          <Pencil className="h-3 w-3 text-gray-400" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:text-red-600"
                          onClick={() => handleDelete(s.id)}
                        >
                          <Trash2 className="h-3 w-3 text-gray-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editId ? 'Upravit příplatek' : 'Přidat příplatek'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Kombinace země / dopravce *</Label>
              <Select
                value={form.country_carrier_id}
                onValueChange={(v) => setForm((f) => ({ ...f, country_carrier_id: v ?? '' }))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Vyberte…" />
                </SelectTrigger>
                <SelectContent>
                  {countryCarriers.map((cc) => (
                    <SelectItem key={cc.id} value={cc.id}>
                      {cc.country?.flag} {cc.country?.code} · {cc.carrier?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Typ příplatku *</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as SurchargeType }))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SURCHARGE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{SURCHARGE_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Hodnota *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="např. 5.5"
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Typ hodnoty</Label>
                <Select
                  value={form.is_percentage ? 'pct' : 'fixed'}
                  onValueChange={(v) => setForm((f) => ({ ...f, is_percentage: v === 'pct' }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pct">% ze základní ceny</SelectItem>
                    <SelectItem value="fixed">Pevná částka</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!form.is_percentage && (
              <div className="space-y-1">
                <Label className="text-xs">Měna (pro pevnou částku)</Label>
                <Input
                  placeholder="CZK / EUR / …"
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Platí od *</Label>
                <Input
                  type="date"
                  value={form.valid_from}
                  onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Platí do (volitelné)</Label>
                <Input
                  type="date"
                  value={form.valid_to}
                  onChange={(e) => setForm((f) => ({ ...f, valid_to: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Zdroj / URL (volitelné)</Label>
              <Input
                placeholder="https://…"
                value={form.source_url}
                onChange={(e) => setForm((f) => ({ ...f, source_url: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>
              Zrušit
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Ukládám…' : 'Uložit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk fuel surcharge dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Hromadná aktualizace palivového příplatku
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Nastaví nový palivový příplatek (%) pro <strong>všechny aktivní trasy</strong> vybraného dopravce najednou.
            Stávající otevřené záznamy volitelně uzavře den před platností nové sazby.
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Dopravce *</Label>
              <Select
                value={bulkForm.carrierCode}
                onValueChange={(v) => setBulkForm((f) => ({ ...f, carrierCode: v ?? '' }))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Vyberte dopravce…" />
                </SelectTrigger>
                <SelectContent>
                  {carriers.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nová sazba (%) *</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="např. 18.8"
                  value={bulkForm.value}
                  onChange={(e) => setBulkForm((f) => ({ ...f, value: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Platí od *</Label>
                <Input
                  type="date"
                  value={bulkForm.valid_from}
                  onChange={(e) => setBulkForm((f) => ({ ...f, valid_from: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={bulkForm.close_previous}
                onChange={(e) => setBulkForm((f) => ({ ...f, close_previous: e.target.checked }))}
                className="rounded"
              />
              <span className="text-xs text-gray-600">Uzavřít stávající otevřené záznamy (doporučeno)</span>
            </label>

            {bulkForm.carrierCode && (
              <div className="text-[11px] text-gray-400 bg-gray-50 rounded px-2 py-1.5">
                Vytvoří záznamy pro{' '}
                <strong className="text-gray-600">
                  {countryCarriers.filter((cc) => cc.carrier?.code === bulkForm.carrierCode).length} tras
                </strong>{' '}
                dopravce {bulkForm.carrierCode}.
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setBulkDialogOpen(false)} disabled={saving}>
              Zrušit
            </Button>
            <Button size="sm" onClick={handleBulkSave} disabled={saving} className="bg-amber-500 hover:bg-amber-600">
              {saving ? 'Ukládám…' : 'Nastavit pro všechny trasy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
