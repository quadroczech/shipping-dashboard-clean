'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import type { CountryCarrier, CarrierBasePrice, ReturnPrice, Surcharge, DeliveryType, Currency } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { toCZK } from '@/lib/constants'
import { FlagImage } from '@/components/ui/flag-image'
import { Loader2, Trash2, Lock, Info } from 'lucide-react'

interface EditRowData {
  customer_price_id: string | null
  cc: CountryCarrier
  delivery_type: DeliveryType | null
  customer_price: number | null
  free_threshold: number | null
  service_name: string | null
}

interface PriceEditDialogProps {
  row: EditRowData
  onClose: () => void
  exchangeRates: Record<Currency, number>
}

export type { EditRowData }

// Loaded state for carrier-side data
interface LoadedCarrier {
  bpId: string | null          // ID of the delivery-type-specific BP record (or null = needs insert)
  bpValue: string              // current base price
  fuelId: string | null
  fuelValue: string            // e.g. "13.3" (percentage) or "1.10" (fixed)
  fuelIsPercent: boolean
  tollId: string | null
  tollValue: string
  tollIsPerKg: boolean
  rpId: string | null
  rpValue: string
}

export function PriceEditDialog({ row, onClose, exchangeRates }: PriceEditDialogProps) {
  const router = useRouter()
  const supabase = createClient()
  const cc = row.cc

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isEditMode = row.customer_price_id != null
  const currency = (cc.country?.currency ?? 'EUR') as Currency

  // Customer price fields
  const [cpForm, setCpForm] = useState({
    customer_price: row.customer_price != null ? String(row.customer_price) : '',
    delivery_type: (row.delivery_type ?? 'home') as DeliveryType,
    service_name: row.service_name ?? '',
    free_shipping_threshold: row.free_threshold != null ? String(row.free_threshold) : '',
  })

  // Active delivery type for carrier base price / surcharge scoping.
  // In edit mode it's locked to the row; when adding a new service the user can
  // switch it, so the base price + surcharges must follow the SELECTED type
  // (otherwise a second delivery type would load/overwrite the first one's data).
  const dt = isEditMode ? (row.delivery_type ?? 'home') : cpForm.delivery_type

  // Carrier / surcharge / return fields — populated from DB
  const [loaded, setLoaded] = useState<LoadedCarrier>({
    bpId: null, bpValue: '',
    fuelId: null, fuelValue: '', fuelIsPercent: true,
    tollId: null, tollValue: '', tollIsPerKg: true,
    rpId: null, rpValue: '',
  })
  // Editable copies of carrier fields
  const [bp, setBp] = useState('')
  const [fuel, setFuel] = useState('')
  const [toll, setToll] = useState('')
  const [rp, setRp] = useState('')

  function cpUpdate<K extends keyof typeof cpForm>(k: K, v: typeof cpForm[K]) {
    setCpForm(p => ({ ...p, [k]: v }))
  }

  // Load carrier data — keyed by BOTH cc.id AND delivery_type
  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().split('T')[0]
      const active = `valid_to.is.null,valid_to.gte.${today}`

      const [bpRes, srRes, rpRes] = await Promise.all([
        // Base prices — only for this delivery_type
        supabase
          .from('carrier_base_prices')
          .select('*')
          .eq('country_carrier_id', cc.id)
          .lte('weight_from', 0.001)
          .lte('valid_from', today)
          .or(active)
          .order('valid_from', { ascending: false }),
        // Surcharges — active only
        supabase
          .from('surcharges')
          .select('*')
          .eq('country_carrier_id', cc.id)
          .lte('valid_from', today)
          .or(active),
        // Return price
        supabase
          .from('return_prices')
          .select('*')
          .eq('country_carrier_id', cc.id)
          .lte('valid_from', today)
          .or(active)
          .order('valid_from', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const bpData = (bpRes.data ?? []) as CarrierBasePrice[]
      const srData = (srRes.data ?? []) as Surcharge[]
      const rpData = rpRes.data as ReturnPrice | null

      // Find BP for THIS specific (delivery_type, service_name).
      // Exact match is linked (its ID allows UPDATE); a shared/null-service
      // fallback is shown for display only so the user sees an inherited value,
      // but saving any edit will INSERT a new service-specific row instead of
      // mutating the shared one — so per-service prices stay independent.
      const sn = row.service_name ?? null
      const exactBp = bpData.find(
        p => p.delivery_type === dt && (p.service_name ?? null) === sn,
      )
      const fallbackBp = bpData.find(
        p => p.delivery_type === dt && (p.service_name ?? null) === null,
      ) ?? bpData.find(
        p => p.delivery_type === null && (p.service_name ?? null) === null,
      )
      const displayBp = exactBp ?? fallbackBp

      const fuel = srData.find(s => s.type === 'fuel')
      const toll = srData.find(s => s.type === 'toll')

      // Convert BP to CZK for display (regardless of stored currency)
      const bpCzk = displayBp
        ? (displayBp.currency as Currency) === 'CZK'
          ? displayBp.base_price
          : toCZK(displayBp.base_price, displayBp.currency as Currency, exchangeRates)
        : null

      // Convert RP to CZK for display
      const rpCzk = rpData
        ? (rpData.currency as Currency) === 'CZK'
          ? rpData.price
          : toCZK(rpData.price, rpData.currency as Currency, exchangeRates)
        : null

      const l: LoadedCarrier = {
        // Only link the ID if we found an exact (delivery_type, service_name) match;
        // the fallback is shown but remains untouched on save.
        bpId: exactBp?.id ?? null,
        bpValue: bpCzk != null ? String(Math.round(bpCzk * 100) / 100) : '',
        fuelId: fuel?.id ?? null,
        fuelValue: fuel ? String(fuel.value) : '',
        fuelIsPercent: fuel?.is_percentage ?? true,
        tollId: toll?.id ?? null,
        tollValue: toll ? String(toll.value) : '',
        tollIsPerKg: toll?.is_per_kg ?? true,
        rpId: rpData?.id ?? null,
        rpValue: rpCzk != null ? String(Math.round(rpCzk * 100) / 100) : '',
      }

      setLoaded(l)
      setBp(l.bpValue)
      setFuel(l.fuelValue)
      setToll(l.tollValue)
      setRp(l.rpValue)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cc.id, dt, row.service_name])

  async function save() {
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]

    try {
      // ── 1. Customer price ────────────────────────────────────────────────────
      if (cpForm.customer_price) {
        const payload = {
          price: parseFloat(cpForm.customer_price),
          currency,
          service_name: cpForm.service_name || null,
          free_shipping_threshold: cpForm.free_shipping_threshold
            ? parseFloat(cpForm.free_shipping_threshold)
            : null,
          valid_from: today,
        }

        if (isEditMode && row.customer_price_id) {
          // UPDATE — by specific ID + cc.id for double safety, NO delivery_type change
          const { error } = await supabase
            .from('customer_prices')
            .update(payload)
            .eq('id', row.customer_price_id)
            .eq('country_carrier_id', cc.id)
          if (error) throw error
        } else {
          // INSERT — always create a new record
          const { error } = await supabase.from('customer_prices').insert({
            ...payload,
            country_carrier_id: cc.id,
            delivery_type: cpForm.delivery_type,
          })
          if (error) throw error
        }
      }

      // ── 2. Carrier base price ────────────────────────────────────────────────
      if (bp !== loaded.bpValue) {
        if (bp === '') {
          // User cleared the field — delete existing record
          if (loaded.bpId) {
            const { error } = await supabase.from('carrier_base_prices').delete().eq('id', loaded.bpId)
            if (error) throw error
          }
        } else {
          const bpVal = parseFloat(bp)
          if (loaded.bpId) {
            const { error } = await supabase
              .from('carrier_base_prices')
              .update({ base_price: bpVal, currency: 'CZK' })
              .eq('id', loaded.bpId)
            if (error) throw error
          } else {
            const { error } = await supabase.from('carrier_base_prices').insert({
              country_carrier_id: cc.id,
              weight_from: 0,
              weight_to: 2,
              base_price: bpVal,
              currency: 'CZK',
              delivery_type: dt,
              // Scope the new row to this specific service so other services
              // (e.g. FAN Box vs Packeta.ro) keep their own base price.
              service_name: (cpForm.service_name || row.service_name) ?? null,
              valid_from: today,
            })
            if (error) throw error
          }
        }
      }

      // ── 3. Fuel surcharge ────────────────────────────────────────────────────
      if (fuel !== loaded.fuelValue) {
        if (fuel === '') {
          // User cleared the field — delete existing record
          if (loaded.fuelId) {
            const { error } = await supabase.from('surcharges').delete().eq('id', loaded.fuelId)
            if (error) throw error
          }
        } else {
          const fuelVal = parseFloat(fuel)
          if (loaded.fuelId) {
            const { error } = await supabase
              .from('surcharges')
              .update({ value: fuelVal })
              .eq('id', loaded.fuelId)
            if (error) throw error
          } else {
            const { error } = await supabase.from('surcharges').insert({
              country_carrier_id: cc.id,
              type: 'fuel',
              value: fuelVal,
              is_percentage: true,
              is_per_kg: false,
              currency: null,
              valid_from: today,
            })
            if (error) throw error
          }
        }
      }

      // ── 4. Toll surcharge ────────────────────────────────────────────────────
      if (toll !== loaded.tollValue) {
        if (toll === '') {
          // User cleared the field — delete existing record
          if (loaded.tollId) {
            const { error } = await supabase.from('surcharges').delete().eq('id', loaded.tollId)
            if (error) throw error
          }
        } else {
          const tollVal = parseFloat(toll)
          if (loaded.tollId) {
            const { error } = await supabase
              .from('surcharges')
              .update({ value: tollVal })
              .eq('id', loaded.tollId)
            if (error) throw error
          } else {
            const { error } = await supabase.from('surcharges').insert({
              country_carrier_id: cc.id,
              type: 'toll',
              value: tollVal,
              is_percentage: false,
              is_per_kg: true,
              currency: 'CZK',
              valid_from: today,
            })
            if (error) throw error
          }
        }
      }

      // ── 5. Return price ──────────────────────────────────────────────────────
      if (rp !== loaded.rpValue) {
        if (rp === '') {
          // User cleared the field — delete existing record
          if (loaded.rpId) {
            const { error } = await supabase.from('return_prices').delete().eq('id', loaded.rpId)
            if (error) throw error
          }
        } else {
          const rpVal = parseFloat(rp)
          if (loaded.rpId) {
            const { error } = await supabase
              .from('return_prices')
              .update({ price: rpVal, currency: 'CZK' })
              .eq('id', loaded.rpId)
            if (error) throw error
          } else {
            const { error } = await supabase.from('return_prices').insert({
              country_carrier_id: cc.id,
              price: rpVal,
              currency: 'CZK',
              valid_from: today,
            })
            if (error) throw error
          }
        }
      }

      toast.success('Ceny byly uloženy')
      router.refresh()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message
        : (err && typeof err === 'object' && 'message' in err) ? String((err as { message: unknown }).message)
        : 'neznámá chyba'
      toast.error(`Chyba při ukládání: ${msg}`)
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!row.customer_price_id) return
    setDeleting(true)
    try {
      // Delete the customer price record
      const { error } = await supabase
        .from('customer_prices')
        .delete()
        .eq('id', row.customer_price_id)
      if (error) throw error

      // Check if any customer prices remain for this country_carrier
      const { data: remaining } = await supabase
        .from('customer_prices')
        .select('id')
        .eq('country_carrier_id', cc.id)
        .limit(1)

      if (!remaining || remaining.length === 0) {
        // No prices left — remove all associated data and the country_carrier itself
        await supabase.from('carrier_base_prices').delete().eq('country_carrier_id', cc.id)
        await supabase.from('surcharges').delete().eq('country_carrier_id', cc.id)
        await supabase.from('return_prices').delete().eq('country_carrier_id', cc.id)
        await supabase.from('country_carriers').delete().eq('id', cc.id)
      }

      toast.success('Doprava byla smazána')
      router.refresh()
      onClose()
    } catch (err) {
      toast.error('Chyba při mazání')
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-1.5">
            {isEditMode ? 'Upravit' : 'Nová'} doprava —{' '}
            <FlagImage code={cc.country?.code ?? ''} /> {cc.country?.code} · {cc.carrier?.name}
          </DialogTitle>
          <p className="text-xs text-gray-400">
            Měna: {currency}
            {isEditMode && row.service_name && <span className="ml-2">· {row.service_name}</span>}
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">Načítám data…</span>
          </div>
        ) : (
          <Tabs defaultValue="customer">
            <TabsList className="w-full">
              <TabsTrigger value="customer" className="flex-1 text-xs">Zákazník</TabsTrigger>
              <TabsTrigger value="carrier" className="flex-1 text-xs">Dopravce</TabsTrigger>
              <TabsTrigger value="return" className="flex-1 text-xs">Vratky</TabsTrigger>
            </TabsList>

            {/* ── Customer ── */}
            <TabsContent value="customer" className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Typ doručení</Label>
                {isEditMode ? (
                  <div className="flex items-center gap-2 h-8 px-3 rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-600">
                    {cpForm.delivery_type === 'home' ? 'Doručení domů (kurýr)' : 'Výdejní místo / Box'}
                    <Lock className="h-3 w-3 text-gray-400 ml-auto" />
                  </div>
                ) : (
                  <Select value={cpForm.delivery_type} onValueChange={v => cpUpdate('delivery_type', v as DeliveryType)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="home">Doručení domů (kurýr)</SelectItem>
                      <SelectItem value="pickup">Výdejní místo / Box</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Název služby (volitelné)</Label>
                <Input type="text" placeholder="např. Na adresu" value={cpForm.service_name}
                  onChange={e => cpUpdate('service_name', e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Cena dopravy pro zákazníka ({currency})</Label>
                <Input type="number" step="0.01" placeholder="např. 99.00" value={cpForm.customer_price}
                  onChange={e => cpUpdate('customer_price', e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Doprava zdarma od ({currency}) — volitelné</Label>
                <Input type="number" step="0.01" placeholder="např. 1500.00" value={cpForm.free_shipping_threshold}
                  onChange={e => cpUpdate('free_shipping_threshold', e.target.value)} className="h-8 text-sm" />
              </div>
            </TabsContent>

            {/* ── Carrier ── */}
            <TabsContent value="carrier" className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Základní cena dopravce — {dt === 'home' ? 'doručení domů' : 'výdejní místo'} (CZK)
                </Label>
                <Input type="number" step="0.01" placeholder="např. 56.18" value={bp}
                  onChange={e => setBp(e.target.value)} className="h-8 text-sm" />
                <p className="text-[10px] text-gray-400">Zadávejte vždy v CZK — přepočet do místní měny probíhá automaticky.</p>
              </div>

              <div className="h-px bg-gray-100 my-1" />

              <div className="space-y-1.5">
                <Label className="text-xs">Palivový příplatek — přepis (%)</Label>
                <Input type="number" step="0.1" min="0" placeholder="prázdné = sazba dopravce" value={fuel}
                  onChange={e => setFuel(e.target.value)} className="h-8 text-sm" />
                <p className="text-[10px] text-gray-400">Prázdné = použij sazbu dopravce · 0 = bez příplatku · jiná hodnota = přepisuje sazbu dopravce</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Mýtný příplatek — přepis (CZK/kg)</Label>
                <Input type="number" step="0.01" min="0" placeholder="prázdné = sazba dopravce" value={toll}
                  onChange={e => setToll(e.target.value)} className="h-8 text-sm" />
                <p className="text-[10px] text-gray-400">Prázdné = použij sazbu dopravce · 0 = bez příplatku · jiná hodnota = přepisuje sazbu dopravce</p>
              </div>
            </TabsContent>

            {/* ── Return ── */}
            <TabsContent value="return" className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Cena zpětné dopravy (vratky) od dopravce (CZK)</Label>
                <Input type="number" step="0.01" placeholder="např. 65.00" value={rp}
                  onChange={e => setRp(e.target.value)} className="h-8 text-sm" />
                <p className="text-[10px] text-gray-400">Zadávejte vždy v CZK — přepočet do místní měny probíhá automaticky.</p>
              </div>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="flex !justify-between">
          {isEditMode ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600">Opravdu smazat?</span>
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Mažu…' : 'Ano, smazat'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>Ne</Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={() => setConfirmDelete(true)} disabled={saving}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />Smazat
              </Button>
            )
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving || deleting}>Zrušit</Button>
            <Button size="sm" onClick={save} disabled={saving || loading || deleting}>
              {saving ? 'Ukládám…' : 'Uložit'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
