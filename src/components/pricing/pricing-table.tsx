'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PriceEditDialog, type EditRowData } from '@/components/pricing/price-edit-dialog'
import { FlagImage } from '@/components/ui/flag-image'
import { CarrierBadge } from '@/components/ui/carrier-badge'
import type {
  Country,
  Carrier,
  CountryCarrier,
  CustomerPrice,
  CarrierBasePrice,
  ReturnPrice,
  Surcharge,
  CarrierSurcharge,
  Currency,
  DeliveryType,
} from '@/types'
import { formatCurrency, toCZK, SURCHARGE_TYPE_LABELS } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, Home, Package, Plus, Search, SlidersHorizontal, AlertTriangle, Fuel, ExternalLink, Power, PowerOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PricingTableProps {
  countryCarriers: CountryCarrier[]
  customerPrices: CustomerPrice[]
  basePrices: CarrierBasePrice[]
  returnPrices: ReturnPrice[]
  surcharges: Surcharge[]
  carrierSurcharges: CarrierSurcharge[]
  exchangeRates: Record<Currency, number>
  allCountries: Country[]
  allCarriers: Carrier[]
}

type SortKey = 'country' | 'carrier' | 'customer_price' | 'margin_pct'
type DeliveryFilter = 'all' | 'home' | 'pickup'
type MarginFilter = 'all' | 'negative' | 'under10' | 'under20'
type StatusFilter = 'all' | 'active' | 'inactive'

interface PricingRow {
  key: string
  customer_price_id: string | null
  cc: CountryCarrier
  is_active: boolean
  cur: Currency
  service_name: string | null
  delivery_type: DeliveryType | null
  customer_price: number | null
  free_threshold: number | null
  base_price: number | null
  surcharges_total: number
  surcharges_breakdown: Surcharge[]
  total_carrier: number
  margin: number | null
  marginPct: number | null
  return_price: number | null
}

export function PricingTable({
  countryCarriers,
  customerPrices,
  basePrices,
  returnPrices,
  surcharges,
  carrierSurcharges,
  exchangeRates,
  allCountries,
  allCarriers,
}: PricingTableProps) {
  const router = useRouter()
  const [filterCountry, setFilterCountry] = useState('all')
  const [filterCarrier, setFilterCarrier] = useState('all')
  const [filterDelivery, setFilterDelivery] = useState<DeliveryFilter>('all')
  const [filterMargin, setFilterMargin] = useState<MarginFilter>('all')
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('country')
  const [editRow, setEditRow] = useState<EditRowData | null>(null)
  const [currency, setCurrency] = useState<'local' | 'czk'>('local')
  const [addOpen, setAddOpen] = useState(false)
  const [addCountryCode, setAddCountryCode] = useState('')
  const [addCarrierCode, setAddCarrierCode] = useState('')
  const [addNewCarrier, setAddNewCarrier] = useState(false)
  const [newCarrierName, setNewCarrierName] = useState('')
  const [newCarrierCode, setNewCarrierCode] = useState('')
  const [newCarrierColor, setNewCarrierColor] = useState('#666666')
  const [addSaving, setAddSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<CountryCarrier | null>(null)
  const [deleting, setDeleting] = useState(false)

  const uniqueCountries = useMemo(() => {
    const map = new Map<string, { code: string; flag: string; name: string }>()
    countryCarriers.forEach((cc) => {
      if (cc.country) map.set(cc.country.id, { code: cc.country.code, flag: cc.country.flag, name: cc.country.name })
    })
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code))
  }, [countryCarriers])

  const uniqueCarriers = useMemo(() => {
    const map = new Map<string, { code: string; name: string; color: string }>()
    countryCarriers.forEach((cc) => {
      if (cc.carrier) map.set(cc.carrier.id, { code: cc.carrier.code, name: cc.carrier.name, color: cc.carrier.logo_color })
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [countryCarriers])

  const rows = useMemo((): PricingRow[] => {
    return countryCarriers
      .filter((cc) => {
        if (filterCountry !== 'all' && cc.country?.code !== filterCountry) return false
        if (filterCarrier !== 'all' && cc.carrier?.code !== filterCarrier) return false
        return true
      })
      .flatMap((cc): PricingRow[] => {
        const cur = cc.country?.currency as Currency
        const prices = customerPrices.filter((p) => p.country_carrier_id === cc.id)
        const ccBasePrices = basePrices.filter((p) => p.country_carrier_id === cc.id)
        const rp = returnPrices.find((p) => p.country_carrier_id === cc.id)
        const ccSurcharges = surcharges.filter((s) => s.country_carrier_id === cc.id)

        function findBasePrice(deliveryType: DeliveryType | null, serviceName: string | null) {
          const sn = serviceName ?? null
          // 1. exact match on (delivery_type, service_name)
          const exact = ccBasePrices.find(
            (p) => p.delivery_type === deliveryType && (p.service_name ?? null) === sn,
          )
          if (exact) return exact
          // 2. same delivery_type, shared (null) service — inherited default
          const sharedSameDt = ccBasePrices.find(
            (p) => p.delivery_type === deliveryType && (p.service_name ?? null) === null,
          )
          if (sharedSameDt) return sharedSameDt
          // 3. fully shared record (null delivery_type, null service)
          return ccBasePrices.find(
            (p) => p.delivery_type === null && (p.service_name ?? null) === null,
          )
        }

        function toBpLocal(bp: CarrierBasePrice | undefined): number | null {
          if (!bp) return null
          return (bp.currency as Currency) === cur
            ? bp.base_price
            : toCZK(bp.base_price, bp.currency as Currency, exchangeRates) / exchangeRates[cur]
        }

        function computeSurcharges(bpLocal: number | null, bp: CarrierBasePrice | undefined): number {
          if (bpLocal == null || bp?.surcharges_included) return 0
          const defaultWeightKg = 2
          let total = 0
          // Carrier-level: fuel and toll — with per-route override support.
          // If surcharges table has a record with same type: value=0 disables it,
          // value>0 replaces the carrier-level rate for this route.
          const carrierId = cc.carrier?.id
          if (carrierId) {
            carrierSurcharges.filter(s => s.carrier_id === carrierId).forEach((cs) => {
              const override = ccSurcharges.find(s => s.type === cs.type)
              if (override !== undefined) {
                if (override.value > 0) {
                  if (override.is_percentage) {
                    total += bpLocal * (override.value / 100)
                  } else {
                    const srcCur = (override.currency ?? cur) as Currency
                    let amount = srcCur === cur
                      ? override.value
                      : toCZK(override.value, srcCur, exchangeRates) / exchangeRates[cur]
                    if (override.is_per_kg) amount = amount * defaultWeightKg
                    total += amount
                  }
                }
                return // override handled (value=0 means skip)
              }
              // No override: use carrier-level rate. Flat / per-kg surcharges
              // (e.g. toll) are denominated in CZK — convert to the route's
              // local currency so non-CZK countries aren't inflated by FX.
              if (cs.is_percentage) {
                total += bpLocal * (cs.value / 100)
              } else {
                const localValue = toCZK(cs.value, 'CZK', exchangeRates) / exchangeRates[cur]
                total += cs.is_per_kg ? localValue * defaultWeightKg : localValue
              }
            })
          }
          // Per-route: COD, address_delivery, etc. — fuel/toll already handled above
          ccSurcharges.forEach((s) => {
            if (s.type === 'fuel' || s.type === 'toll') return
            if (s.is_percentage) {
              total += bpLocal * (s.value / 100)
            } else {
              const srcCur = (s.currency ?? cur) as Currency
              let amount = srcCur === cur
                ? s.value
                : toCZK(s.value, srcCur, exchangeRates) / exchangeRates[cur]
              if (s.is_per_kg) amount = amount * defaultWeightKg
              total += amount
            }
          })
          return total
        }

        // 1. One row per customer price.
        const customerRows: PricingRow[] = prices.map((price): PricingRow => {
          const bp = findBasePrice(price.delivery_type as DeliveryType, price.service_name ?? null)
          const bpLocal = toBpLocal(bp)
          const surchargesTotal = computeSurcharges(bpLocal, bp)
          const totalCarrier = (bpLocal ?? 0) + surchargesTotal

          const vatRate = cc.country?.vat_rate ?? 0
          const customerPriceNet = price.price / (1 + vatRate)
          const margin = bpLocal != null ? customerPriceNet - totalCarrier : null
          const marginPct = (bpLocal != null && customerPriceNet > 0)
            ? ((customerPriceNet - totalCarrier) / customerPriceNet) * 100
            : null
          return {
            key: price.id,
            customer_price_id: price.id,
            cc, cur,
            is_active: cc.is_active ?? true,
            service_name: price.service_name ?? null,
            delivery_type: price.delivery_type as DeliveryType,
            customer_price: price.price,
            free_threshold: price.free_shipping_threshold ?? null,
            base_price: bpLocal,
            surcharges_total: surchargesTotal,
            surcharges_breakdown: ccSurcharges,
            total_carrier: totalCarrier,
            margin,
            marginPct,
            return_price: rp?.price ?? null,
          }
        })

        // 2. Extra rows for configured carrier options (base prices) that have a
        // concrete delivery type but no matching customer price yet — so options
        // set up in the "Dopravci" agenda always appear here and can be completed.
        //
        // A base-price option is already "covered" (and must NOT get a duplicate
        // empty row) when a customer price already uses the same delivery slot.
        // This mirrors findBasePrice resolution: a shared base (service_name null)
        // is the fallback for every service of its delivery_type, so any customer
        // price with that delivery_type covers it; a service-specific base needs an
        // exact (delivery_type, service_name) match. Comparing raw composite keys
        // instead spawned a phantom "Nezadáno" row for every priced route whose
        // base price is shared (the common case: priced rows carry a service name,
        // base prices are shared with service_name = null).
        function isBaseCovered(baseRec: CarrierBasePrice): boolean {
          const bn = baseRec.service_name ?? null
          return prices.some(
            (p) =>
              p.delivery_type === baseRec.delivery_type &&
              (bn === null || (p.service_name ?? null) === bn),
          )
        }
        const distinctBase = Array.from(
          new Map(
            ccBasePrices
              .filter((b) => b.delivery_type != null)
              .map((b) => [`${b.delivery_type ?? ''}__${b.service_name ?? ''}`, b]),
          ).values(),
        )
        const baseOnlyRows: PricingRow[] = []
        distinctBase.forEach((baseRec, idx) => {
          if (isBaseCovered(baseRec)) return
          const bpLocal = toBpLocal(baseRec)
          const surchargesTotal = computeSurcharges(bpLocal, baseRec)
          baseOnlyRows.push({
            key: `${cc.id}__base__${idx}`,
            customer_price_id: null,
            cc, cur,
            is_active: cc.is_active ?? true,
            service_name: baseRec.service_name ?? null,
            delivery_type: baseRec.delivery_type as DeliveryType,
            customer_price: null,
            free_threshold: null,
            base_price: bpLocal,
            surcharges_total: surchargesTotal,
            surcharges_breakdown: ccSurcharges,
            total_carrier: (bpLocal ?? 0) + surchargesTotal,
            margin: null,
            marginPct: null,
            return_price: rp?.price ?? null,
          })
        })

        // 3. If nothing at all is configured, still show a single empty row so the
        // country_carrier is visible and editable.
        if (customerRows.length === 0 && baseOnlyRows.length === 0) {
          const bp = findBasePrice(null, null) ?? ccBasePrices[0]
          const bpLocal = toBpLocal(bp)
          const surchargesTotal = computeSurcharges(bpLocal, bp)
          return [{
            key: `${cc.id}__empty`,
            customer_price_id: null,
            cc, cur,
            is_active: cc.is_active ?? true,
            service_name: null,
            delivery_type: null,
            customer_price: null,
            free_threshold: null,
            base_price: bpLocal,
            surcharges_total: surchargesTotal,
            surcharges_breakdown: ccSurcharges,
            total_carrier: (bpLocal ?? 0) + surchargesTotal,
            margin: null,
            marginPct: null,
            return_price: rp?.price ?? null,
          }]
        }

        return [...customerRows, ...baseOnlyRows]
      })
      .filter((row) => {
        if (filterDelivery === 'home')   return row.delivery_type === 'home'
        if (filterDelivery === 'pickup') return row.delivery_type === 'pickup'
        return true
      })
      .filter((row) => {
        if (filterMargin === 'negative') return row.marginPct != null && row.marginPct < 0
        if (filterMargin === 'under10')  return row.marginPct != null && row.marginPct < 10
        if (filterMargin === 'under20')  return row.marginPct != null && row.marginPct < 20
        return true
      })
      .filter((row) => {
        if (filterStatus === 'active')   return row.is_active
        if (filterStatus === 'inactive') return !row.is_active
        return true
      })
      .sort((a, b) => {
        // When margin filter is active, always sort worst-first regardless of sortKey
        if (filterMargin !== 'all') return (a.marginPct ?? 999) - (b.marginPct ?? 999)
        if (sortKey === 'country') {
          const c = (a.cc.country?.code ?? '').localeCompare(b.cc.country?.code ?? '')
          return c !== 0 ? c : (a.cc.carrier?.name ?? '').localeCompare(b.cc.carrier?.name ?? '')
        }
        if (sortKey === 'carrier') return (a.cc.carrier?.name ?? '').localeCompare(b.cc.carrier?.name ?? '')
        if (sortKey === 'customer_price') return (b.customer_price ?? 0) - (a.customer_price ?? 0)
        if (sortKey === 'margin_pct') return (a.marginPct ?? 999) - (b.marginPct ?? 999)
        return 0
      })
  }, [countryCarriers, filterCountry, filterCarrier, filterDelivery, filterMargin, filterStatus, sortKey,
      customerPrices, basePrices, returnPrices, surcharges, exchangeRates])

  // Stats for the header
  const totalRows = rows.length
  const missingPrices = rows.filter((r) => r.customer_price == null).length
  const negativePrices = rows.filter((r) => r.marginPct != null && r.marginPct < 0).length
  const inactiveRoutes = countryCarriers.filter((cc) => !(cc.is_active ?? true)).length

  function fmt(amount: number | null, cur: Currency): string {
    if (amount == null) return '—'
    if (currency === 'czk') return formatCurrency(toCZK(amount, cur, exchangeRates), 'CZK')
    return formatCurrency(amount, cur)
  }

  // Fuel surcharges grouped by carrier for the banner
  const fuelByCarrier = useMemo(() => {
    const map = new Map<string, { carrier: { code: string; name: string; logo_color: string; fuel_surcharge_url: string | null }; value: number; is_percentage: boolean; valid_from: string; source_url: string | null }>()
    carrierSurcharges.filter(s => s.type === 'fuel').forEach(s => {
      const carrier = s.carrier
      if (!carrier || map.has(carrier.code)) return
      map.set(carrier.code, {
        carrier: { code: carrier.code, name: carrier.name, logo_color: carrier.logo_color, fuel_surcharge_url: carrier.fuel_surcharge_url ?? null },
        value: s.value,
        is_percentage: s.is_percentage,
        valid_from: s.valid_from,
        source_url: s.source_url ?? null,
      })
    })
    return [...map.values()]
  }, [carrierSurcharges])

  // Available carriers for the add dialog — show all carriers, mark those already assigned
  const addAvailableCarriers = useMemo(() => allCarriers, [allCarriers])

  const addCarrierAlreadyExists = useMemo(() => {
    if (!addCountryCode || !addCarrierCode) return false
    return countryCarriers.some(
      cc => cc.country?.code === addCountryCode && cc.carrier?.code === addCarrierCode
    )
  }, [addCountryCode, addCarrierCode, countryCarriers])

  async function handleAddContinue() {
    if (addNewCarrier) {
      if (!newCarrierCode || !newCarrierName || !addCountryCode) {
        toast.error('Vyplňte zemi, kód a název dopravce')
        return
      }
    } else {
      if (!addCountryCode || !addCarrierCode) {
        toast.error('Vyberte zemi a dopravce')
        return
      }
    }

    setAddSaving(true)
    try {
      const supabase = createClient()
      let carrierId: string
      let carrierObj: Carrier

      if (addNewCarrier) {
        // Create new carrier
        const { data: newC, error: cErr } = await supabase
          .from('carriers')
          .insert({
            code: newCarrierCode.toUpperCase(),
            name: newCarrierName,
            logo_color: newCarrierColor,
          })
          .select()
          .single()
        if (cErr) throw cErr
        carrierId = newC.id
        carrierObj = newC as Carrier
      } else {
        const c = allCarriers.find(c => c.code === addCarrierCode)
        if (!c) throw new Error('Carrier not found')
        carrierId = c.id
        carrierObj = c
      }

      const country = allCountries.find(c => c.code === addCountryCode)
      if (!country) throw new Error('Country not found')

      // Find or create country_carrier
      let cc = countryCarriers.find(
        cc => cc.country?.code === addCountryCode && cc.carrier_id === carrierId
      )

      if (!cc) {
        const { data: newCc, error: ccErr } = await supabase
          .from('country_carriers')
          .insert({
            country_id: country.id,
            carrier_id: carrierId,
            is_active: true,
          })
          .select('*, country:countries(*), carrier:carriers(*)')
          .single()
        if (ccErr) throw ccErr
        cc = newCc as CountryCarrier
      }

      setAddOpen(false)
      setAddCountryCode('')
      setAddCarrierCode('')
      setAddNewCarrier(false)
      setNewCarrierName('')
      setNewCarrierCode('')
      setNewCarrierColor('#666666')

      // Open price edit dialog for this country-carrier
      setEditRow({
        customer_price_id: null,
        cc: cc!,
        delivery_type: null,
        customer_price: null,
        free_threshold: null,
        service_name: null,
      })
      router.refresh()
    } catch (err) {
      toast.error('Chyba při vytváření')
      console.error(err)
    } finally {
      setAddSaving(false)
    }
  }

  async function handleToggleActive(cc: CountryCarrier) {
    const next = !(cc.is_active ?? true)
    setTogglingId(cc.id)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('country_carriers')
        .update({ is_active: next })
        .eq('id', cc.id)
      if (error) throw error
      toast.success(
        next
          ? `${cc.country?.code} · ${cc.carrier?.name} aktivováno`
          : `${cc.country?.code} · ${cc.carrier?.name} deaktivováno — vyřazeno ze statistik`,
      )
      router.refresh()
    } catch (err) {
      toast.error('Chyba při změně stavu dopravy')
      console.error(err)
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDeleteRoute() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      const supabase = createClient()
      // country_carriers FKs (customer_prices, carrier_base_prices, return_prices,
      // surcharges, invoices) are ON DELETE CASCADE — this removes the whole route.
      const { error } = await supabase.from('country_carriers').delete().eq('id', confirmDelete.id)
      if (error) throw error
      toast.success('Doprava smazána')
      setConfirmDelete(null)
      router.refresh()
    } catch (err) {
      toast.error('Chyba při mazání dopravy')
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Fuel surcharges banner */}
      {fuelByCarrier.length > 0 && (
        <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Fuel className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">Aktuální palivové příplatky</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {fuelByCarrier.map(({ carrier, value, is_percentage, valid_from, source_url }) => {
              const linkUrl = source_url || carrier.fuel_surcharge_url
              return (
                <div key={carrier.code} className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 border border-amber-200/60 px-2.5 py-1.5">
                  <CarrierBadge carrier={carrier} />
                  <span className="text-xs font-black text-amber-800">
                    {is_percentage ? `${value}%` : `${value}`}
                  </span>
                  <span className="text-[9px] text-amber-500">od {valid_from}</span>
                  {linkUrl && (
                    <a href={linkUrl} target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-600">
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick stats bar */}
      <div className="flex items-center gap-4 text-[11px]">
        <span className="text-gray-500">{totalRows} služeb</span>
        {missingPrices > 0 && (
          <span className="flex items-center gap-1 text-amber-600 font-medium">
            <AlertTriangle className="h-3 w-3" />
            {missingPrices} bez ceny
          </span>
        )}
        {negativePrices > 0 && (
          <span className="text-red-600 font-medium">{negativePrices} ztrátových</span>
        )}
        {inactiveRoutes > 0 && (
          <span className="flex items-center gap-1 text-rose-600 font-medium">
            <PowerOff className="h-3 w-3" />
            {inactiveRoutes} neaktivních
          </span>
        )}
      </div>

      {/* Filters — compact single row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Select value={filterCountry} onValueChange={(v) => setFilterCountry(v ?? 'all')}>
          <SelectTrigger className="w-40 h-7 text-[11px] border-gray-200">
            <SelectValue>{filterCountry === 'all' ? 'Všechny země' : filterCountry}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny země</SelectItem>
            {uniqueCountries.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                <span className="flex items-center gap-1.5">
                  <FlagImage code={c.code} /> {c.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCarrier} onValueChange={(v) => setFilterCarrier(v ?? 'all')}>
          <SelectTrigger className="w-36 h-7 text-[11px] border-gray-200">
            <SelectValue>{filterCarrier === 'all' ? 'Dopravce: vše' : filterCarrier}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všichni dopravci</SelectItem>
            {uniqueCarriers.map((c) => (
              <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterDelivery} onValueChange={(v) => setFilterDelivery(v as DeliveryFilter)}>
          <SelectTrigger className="w-40 h-7 text-[11px] border-gray-200">
            <SelectValue>{filterDelivery === 'all' ? 'Doručení: vše' : filterDelivery === 'home' ? 'Domů' : 'Výdejní místa'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Typ doručení: vše</SelectItem>
            <SelectItem value="home">Doručení domů</SelectItem>
            <SelectItem value="pickup">Výdejní místa</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterMargin} onValueChange={(v) => setFilterMargin(v as MarginFilter)}>
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

        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as StatusFilter)}>
          <SelectTrigger className={cn('w-36 h-7 text-[11px] border-gray-200', filterStatus === 'inactive' && 'border-rose-300 text-rose-700 bg-rose-50')}>
            <SelectValue>
              {filterStatus === 'all' ? 'Stav: vše' : filterStatus === 'active' ? 'Jen aktivní' : 'Jen neaktivní'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Stav: vše</SelectItem>
            <SelectItem value="active">Jen aktivní</SelectItem>
            <SelectItem value="inactive">Jen neaktivní</SelectItem>
          </SelectContent>
        </Select>

        <div className="h-4 w-px bg-gray-200 mx-1" />

        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-36 h-7 text-[11px] border-gray-200">
            <SelectValue>{sortKey === 'country' ? 'Dle země' : sortKey === 'carrier' ? 'Dle dopravce' : sortKey === 'margin_pct' ? 'Dle marže' : 'Dle ceny'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="country">Podle země</SelectItem>
            <SelectItem value="carrier">Podle dopravce</SelectItem>
            <SelectItem value="margin_pct">Nejhorší marže</SelectItem>
            <SelectItem value="customer_price">Cena zákazníka</SelectItem>
          </SelectContent>
        </Select>

        <Select value={currency} onValueChange={(v) => setCurrency(v as 'local' | 'czk')}>
          <SelectTrigger className="w-28 h-7 text-[11px] border-gray-200">
            <SelectValue>{currency === 'local' ? 'Lokální' : 'Vše CZK'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="local">Lokální</SelectItem>
            <SelectItem value="czk">Vše CZK</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <Button size="sm" className="h-7 text-[11px] gap-1" onClick={() => { setAddCountryCode(''); setAddCarrierCode(''); setAddNewCarrier(false); setAddOpen(true) }}>
            <Plus className="h-3 w-3" /> Přidat dopravu
          </Button>
        </div>
      </div>

      {/* Table */}
      <Tabs defaultValue="delivery">
        <TabsList className="h-8 bg-gray-100/80">
          <TabsTrigger value="delivery" className="text-[11px] data-[state=active]:font-semibold">Doprava</TabsTrigger>
          <TabsTrigger value="returns" className="text-[11px] data-[state=active]:font-semibold">Vratky</TabsTrigger>
        </TabsList>

        <TabsContent value="delivery">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Země</th>
                      <th className="text-left font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Dopravce</th>
                      <th className="text-left font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Služba</th>
                      <th className="text-right font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Cena zák.</th>
                      <th className="text-right font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Zdarma od</th>
                      <th className="text-right font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Dopravce</th>
                      <th className="text-right font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Příplatky</th>
                      <th className="text-right font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Celkem</th>
                      <th className="text-right font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Marže</th>
                      <th className="text-center font-medium text-gray-400 px-2 py-2.5 text-[10px] uppercase tracking-wider w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const isInactive = !row.is_active
                      const isNegative = !isInactive && row.marginPct != null && row.marginPct < 0
                      const isLow = !isInactive && row.marginPct != null && row.marginPct >= 0 && row.marginPct < 5
                      const isMissing = !isInactive && row.customer_price == null
                      return (
                        <tr
                          key={row.key}
                          className={cn(
                            'border-b border-gray-50 transition-colors group',
                            isInactive ? 'bg-rose-50/60 text-rose-400' : '',
                            isNegative ? 'bg-red-50/30' : isLow ? 'bg-amber-50/20' : '',
                            isMissing ? 'bg-gray-50/50' : '',
                            'hover:bg-blue-50/30'
                          )}
                        >
                          <td className="px-3 py-2">
                            <div className="font-semibold text-gray-700 flex items-center gap-1.5">
                              <FlagImage code={row.cc.country?.code ?? ''} />
                              {row.cc.country?.code}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {row.cc.carrier && <CarrierBadge carrier={row.cc.carrier} />}
                              {isInactive && (
                                <Badge variant="outline" className="bg-rose-100 border-rose-200 text-rose-700 text-[9px] px-1.5 py-0 h-4 gap-0.5">
                                  <PowerOff className="h-2.5 w-2.5" /> Neaktivní
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {row.delivery_type === 'home' ? (
                                <span title="Doručení domů (kurýr)" className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-indigo-50 text-indigo-600 shrink-0">
                                  <Home className="h-3 w-3" />
                                </span>
                              ) : row.delivery_type === 'pickup' ? (
                                <span title="Výdejní místo / box" className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-emerald-50 text-emerald-600 shrink-0">
                                  <Package className="h-3 w-3" />
                                </span>
                              ) : null}
                              <span className="truncate max-w-[80px] text-gray-600">{row.service_name ?? <span className="text-gray-300">—</span>}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {row.customer_price != null ? (
                              <div>
                                <span className="font-semibold text-gray-800">{fmt(row.customer_price, row.cur)}</span>
                                {(() => {
                                  const vatRate = row.cc.country?.vat_rate ?? 0
                                  if (vatRate > 0) {
                                    const net = row.customer_price! / (1 + vatRate)
                                    return (
                                      <div className="text-[9px] text-gray-400 mt-0.5">
                                        {fmt(net, row.cur)} bez DPH
                                      </div>
                                    )
                                  }
                                  return null
                                })()}
                              </div>
                            ) : (
                              <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-600 text-[9px] px-1.5 py-0 h-4">
                                Nezadáno
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-400 text-[11px]">
                            {row.free_threshold != null ? fmt(row.free_threshold, row.cur) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500 text-[11px]">
                            {row.base_price != null ? fmt(row.base_price, row.cur) : (
                              <span className="text-amber-500">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-[11px]">
                            {row.surcharges_total > 0 ? (
                              <span className="text-orange-600">{fmt(row.surcharges_total, row.cur)}</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-700 text-[11px]">
                            {row.base_price != null ? fmt(row.total_carrier, row.cur) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {row.marginPct != null ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] font-bold px-1.5 py-0 h-5',
                                  isNegative
                                    ? 'bg-red-100 border-red-200 text-red-700'
                                    : isLow
                                    ? 'bg-amber-100 border-amber-200 text-amber-700'
                                    : 'bg-green-50 border-green-200 text-green-700'
                                )}
                              >
                                {row.marginPct.toFixed(1)}%
                              </Badge>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center justify-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Upravit"
                                onClick={() => setEditRow({
                                  customer_price_id: row.customer_price_id,
                                  cc: row.cc,
                                  delivery_type: row.delivery_type,
                                  customer_price: row.customer_price,
                                  free_threshold: row.free_threshold,
                                  service_name: row.service_name,
                                })}
                              >
                                <Pencil className="h-3 w-3 text-blue-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  'h-6 w-6 transition-opacity',
                                  isInactive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                                )}
                                title={isInactive ? 'Aktivovat dopravu' : 'Deaktivovat dopravu (zachová historii, vyřadí ze statistik)'}
                                disabled={togglingId === row.cc.id}
                                onClick={() => handleToggleActive(row.cc)}
                              >
                                {isInactive
                                  ? <Power className="h-3 w-3 text-emerald-500" />
                                  : <PowerOff className="h-3 w-3 text-rose-400" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Smazat celou dopravu"
                                onClick={() => setConfirmDelete(row.cc)}
                              >
                                <Trash2 className="h-3 w-3 text-red-400" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-4 py-10 text-center text-gray-400">
                          Žádné záznamy pro zvolený filtr
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="returns">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Země</th>
                      <th className="text-left font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Dopravce</th>
                      <th className="text-right font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">Cena vratky</th>
                      <th className="text-right font-medium text-gray-400 px-3 py-2.5 text-[10px] uppercase tracking-wider">V CZK</th>
                      <th className="text-center font-medium text-gray-400 px-2 py-2.5 text-[10px] uppercase tracking-wider w-14"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={row.key} className={cn('border-b border-gray-50 hover:bg-blue-50/30 group', !row.is_active && 'bg-rose-50/60 text-rose-400')}>
                        <td className="px-3 py-2 font-semibold text-gray-700">
                          <div className="flex items-center gap-1.5">
                            <FlagImage code={row.cc.country?.code ?? ''} />
                            {row.cc.country?.code}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            {row.cc.carrier && <CarrierBadge carrier={row.cc.carrier} />}
                            {!row.is_active && (
                              <Badge variant="outline" className="bg-rose-100 border-rose-200 text-rose-700 text-[9px] px-1.5 py-0 h-4 gap-0.5">
                                <PowerOff className="h-2.5 w-2.5" /> Neaktivní
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.return_price != null
                            ? <span className="font-semibold text-gray-700">{formatCurrency(row.return_price, row.cur)}</span>
                            : <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-600 text-[9px] px-1.5 py-0 h-4">Nezadáno</Badge>
                          }
                        </td>
                        <td className="px-3 py-2 text-right text-gray-400">
                          {row.return_price != null
                            ? formatCurrency(toCZK(row.return_price, row.cur, exchangeRates), 'CZK')
                            : '—'
                          }
                        </td>
                        <td className="px-2 py-2 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setEditRow({
                              customer_price_id: row.customer_price_id,
                              cc: row.cc,
                              delivery_type: row.delivery_type,
                              customer_price: row.customer_price,
                              free_threshold: row.free_threshold,
                              service_name: row.service_name,
                            })}
                          >
                            <Pencil className="h-3 w-3 text-blue-500" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add new delivery dialog — pick country + carrier */}
      {addOpen && (
        <Dialog open onOpenChange={() => setAddOpen(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">Přidat dopravu</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-1">
              <p className="text-xs text-gray-500">Vyberte zemi a dopravce, pro které chcete přidat nový typ doručení.</p>

              {/* Country select */}
              <div className="space-y-1.5">
                <Label className="text-xs">Země</Label>
                <Select value={addCountryCode} onValueChange={(v) => { setAddCountryCode(v ?? ''); setAddCarrierCode('') }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue>
                      {addCountryCode
                        ? (() => { const c = allCountries.find(c => c.code === addCountryCode); return c ? `${c.flag} ${c.name}` : addCountryCode })()
                        : 'Vyberte zemi…'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {allCountries.filter(c => c.code !== 'COM').map(c => (
                      <SelectItem key={c.code} value={c.code}>
                        <span className="flex items-center gap-1.5">
                          <FlagImage code={c.code} /> {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Carrier select or new carrier */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Dopravce</Label>
                  <button
                    type="button"
                    className="text-[10px] text-blue-500 hover:text-blue-700"
                    onClick={() => { setAddNewCarrier(!addNewCarrier); setAddCarrierCode('') }}
                  >
                    {addNewCarrier ? 'Vybrat existujícího' : '+ Nový dopravce'}
                  </button>
                </div>

                {addNewCarrier ? (
                  <div className="space-y-2 rounded-lg border border-blue-100 bg-blue-50/30 p-2.5">
                    <Input
                      className="h-8 text-xs"
                      placeholder="Kód (např. DHL)"
                      value={newCarrierCode}
                      onChange={e => setNewCarrierCode(e.target.value)}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="Název (např. DHL Express)"
                      value={newCarrierName}
                      onChange={e => setNewCarrierName(e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <Label className="text-[10px] text-gray-500">Barva:</Label>
                      <input
                        type="color"
                        value={newCarrierColor}
                        onChange={e => setNewCarrierColor(e.target.value)}
                        className="h-6 w-8 rounded border border-gray-200 cursor-pointer"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <Select value={addCarrierCode} onValueChange={(v) => setAddCarrierCode(v ?? '')}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue>
                          {addCarrierCode
                            ? (() => { const c = allCarriers.find(c => c.code === addCarrierCode); return c?.name ?? addCarrierCode })()
                            : 'Vyberte dopravce…'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {addCountryCode && (() => {
                          const existingCodes = new Set(
                            countryCarriers
                              .filter(cc => cc.country?.code === addCountryCode)
                              .map(cc => cc.carrier?.code)
                          )
                          const existing = allCarriers.filter(c => existingCodes.has(c.code))
                          const newOnes = allCarriers.filter(c => !existingCodes.has(c.code))
                          return (
                            <>
                              {existing.length > 0 && (
                                <>
                                  <div className="px-2 py-1 text-[9px] text-gray-400 font-semibold uppercase">Přidat typ doručení</div>
                                  {existing.map(c => (
                                    <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                                  ))}
                                </>
                              )}
                              {newOnes.length > 0 && (
                                <>
                                  <div className="px-2 py-1 text-[9px] text-gray-400 font-semibold uppercase border-t mt-1 pt-1">Nový dopravce</div>
                                  {newOnes.map(c => (
                                    <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                                  ))}
                                </>
                              )}
                            </>
                          )
                        })()}
                        {!addCountryCode && allCarriers.map(c => (
                          <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {addCarrierAlreadyExists && (
                      <p className="text-[10px] text-blue-600 bg-blue-50 rounded px-2 py-1">
                        Dopravce již existuje — přidáte nový typ doručení (např. box)
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>Zrušit</Button>
              <Button
                size="sm"
                disabled={addSaving || (!addNewCarrier && (!addCountryCode || !addCarrierCode)) || (addNewCarrier && (!addCountryCode || !newCarrierCode || !newCarrierName))}
                onClick={handleAddContinue}
              >
                {addSaving ? 'Vytvářím…' : 'Pokračovat'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editRow && (
        <PriceEditDialog row={editRow} onClose={() => setEditRow(null)} exchangeRates={exchangeRates} />
      )}

      {confirmDelete && (
        <Dialog open onOpenChange={() => !deleting && setConfirmDelete(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">Smazat dopravu?</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-1 text-sm text-gray-600">
              <p>
                Opravdu smazat celou trasu{' '}
                <span className="font-semibold text-gray-800">
                  {confirmDelete.country?.code} · {confirmDelete.carrier?.name}
                </span>?
              </p>
              <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-2.5 py-2">
                Smažou se i všechny ceny zákazníka, základní sazby dopravce, vratky,
                příplatky a faktury této trasy. Akci nelze vrátit.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)} disabled={deleting}>Zrušit</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDeleteRoute} disabled={deleting}>
                {deleting ? 'Mažu…' : 'Smazat dopravu'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
