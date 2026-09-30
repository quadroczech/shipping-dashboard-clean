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
import { toast } from 'sonner'
import {
  Pencil, ExternalLink, AlertTriangle, CheckCircle, Clock,
  ChevronDown, ChevronRight, User, Mail, Phone, Sparkles,
} from 'lucide-react'
import { PriceListUploadDialog } from '@/components/carriers/pricelist-upload-dialog'
import type { CountryCarrier, Carrier, Country, CarrierBasePrice, Surcharge, Currency } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { differenceInDays, format, parseISO } from 'date-fns'
import { cs } from 'date-fns/locale'
import { FlagImage } from '@/components/ui/flag-image'
import { CarrierBadge } from '@/components/ui/carrier-badge'
import { toCZK, formatCurrency } from '@/lib/constants'

interface ContractsManagerProps {
  countryCarriers: CountryCarrier[]
  carriers: Carrier[]
  countries: Country[]
  basePrices: CarrierBasePrice[]
  surcharges: Surcharge[]
  exchangeRates: Record<Currency, number>
}

function ContractStatus({ end }: { end: string | null }) {
  if (!end) return <Badge variant="outline" className="text-gray-400 border-gray-200 text-[10px]">Bez konce</Badge>
  const days = differenceInDays(parseISO(end), new Date())
  if (days < 0) return (
    <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]" variant="outline">
      <AlertTriangle className="h-2.5 w-2.5 mr-1" />
      Expirováno
    </Badge>
  )
  if (days <= 30) return (
    <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]" variant="outline">
      <AlertTriangle className="h-2.5 w-2.5 mr-1" />
      Vyprší za {days} dní
    </Badge>
  )
  if (days <= 90) return (
    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]" variant="outline">
      <Clock className="h-2.5 w-2.5 mr-1" />
      Vyprší za {days} dní
    </Badge>
  )
  return (
    <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]" variant="outline">
      <CheckCircle className="h-2.5 w-2.5 mr-1" />
      Platná ({days} dní)
    </Badge>
  )
}

export function ContractsManager({ countryCarriers, carriers, countries, basePrices, surcharges, exchangeRates }: ContractsManagerProps) {
  const router = useRouter()
  const supabase = createClient()
  const [editCC, setEditCC] = useState<CountryCarrier | null>(null)
  const [editCarrier, setEditCarrier] = useState<Carrier | null>(null)
  const [form, setForm] = useState({ contract_start: '', contract_end: '', contract_notes: '' })
  const [repForm, setRepForm] = useState({ sales_rep_name: '', sales_rep_email: '', sales_rep_phone: '' })
  const [saving, setSaving] = useState(false)
  const [expandedCarriers, setExpandedCarriers] = useState<Set<string>>(new Set())
  const [uploadCarrier, setUploadCarrier] = useState<Carrier | null>(null)

  // Group by carrier
  const grouped = useMemo(() => {
    const map = new Map<string, { carrier: Carrier; rows: CountryCarrier[] }>()
    countryCarriers.forEach((cc) => {
      const key = cc.carrier?.id ?? 'unknown'
      if (!map.has(key)) {
        map.set(key, { carrier: cc.carrier!, rows: [] })
      }
      map.get(key)!.rows.push(cc)
    })
    map.forEach((v) => v.rows.sort((a, b) => (a.country?.code ?? '').localeCompare(b.country?.code ?? '')))
    return Array.from(map.values()).sort((a, b) => a.carrier.name.localeCompare(b.carrier.name))
  }, [countryCarriers])

  function toggleCarrier(carrierId: string) {
    setExpandedCarriers((prev) => {
      const next = new Set(prev)
      if (next.has(carrierId)) next.delete(carrierId)
      else next.add(carrierId)
      return next
    })
  }

  function openEdit(cc: CountryCarrier) {
    setEditCC(cc)
    setForm({
      contract_start: cc.contract_start ?? '',
      contract_end: cc.contract_end ?? '',
      contract_notes: cc.contract_notes ?? '',
    })
  }

  function openRepEdit(carrier: Carrier) {
    setEditCarrier(carrier)
    setRepForm({
      sales_rep_name: carrier.sales_rep_name ?? '',
      sales_rep_email: carrier.sales_rep_email ?? '',
      sales_rep_phone: carrier.sales_rep_phone ?? '',
    })
  }

  async function handleSave() {
    if (!editCC) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('country_carriers')
        .update({
          contract_start: form.contract_start || null,
          contract_end: form.contract_end || null,
          contract_notes: form.contract_notes || null,
        })
        .eq('id', editCC.id)
      if (error) throw error
      toast.success('Smlouva aktualizována')
      setEditCC(null)
      router.refresh()
    } catch (err) {
      toast.error('Chyba při ukládání')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleRepSave() {
    if (!editCarrier) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('carriers')
        .update({
          sales_rep_name: repForm.sales_rep_name || null,
          sales_rep_email: repForm.sales_rep_email || null,
          sales_rep_phone: repForm.sales_rep_phone || null,
        })
        .eq('id', editCarrier.id)
      if (error) throw error
      toast.success('Obchodní zástupce aktualizován')
      setEditCarrier(null)
      router.refresh()
    } catch (err) {
      toast.error('Chyba při ukládání')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  // Count expiring soon
  const expiringSoon = countryCarriers.filter((cc) => {
    if (!cc.contract_end) return false
    const days = differenceInDays(parseISO(cc.contract_end), new Date())
    return days >= 0 && days <= 90
  })

  return (
    <div className="space-y-3">
      {/* Alert for expiring contracts */}
      {expiringSoon.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 border shadow-none">
          <CardContent className="px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-700">
              <span className="font-semibold">{expiringSoon.length} smluv vyprší do 90 dnů:</span>{' '}
              {expiringSoon.map((cc, i) => (
                <span key={cc.id}>{i > 0 && ', '}
                  <FlagImage code={cc.country?.code ?? ''} className="mx-0.5" />
                  {cc.country?.code} / {cc.carrier?.name}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Carrier cards — compact overview, click to expand */}
      {grouped.map(({ carrier, rows }) => {
        const isExpanded = expandedCarriers.has(carrier.id)
        const countryCount = rows.length
        const activeContracts = rows.filter((cc) => {
          if (!cc.contract_end) return true
          return differenceInDays(parseISO(cc.contract_end), new Date()) >= 0
        })
        const hasExpiring = rows.some((cc) => {
          if (!cc.contract_end) return false
          const days = differenceInDays(parseISO(cc.contract_end), new Date())
          return days >= 0 && days <= 90
        })
        const hasExpired = rows.some((cc) => {
          if (!cc.contract_end) return false
          return differenceInDays(parseISO(cc.contract_end), new Date()) < 0
        })

        const salesRep = carrier.sales_rep_name

        // Carrier base prices for pricing section
        const carrierBPs = basePrices.filter((bp) =>
          rows.some((cc) => cc.id === bp.country_carrier_id)
        )

        return (
          <Card key={carrier.id} className="border-0 shadow-sm overflow-hidden">
            {/* Compact header — always visible */}
            <button
              className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50/50 transition-colors"
              onClick={() => toggleCarrier(carrier.id)}
            >
              <CarrierBadge carrier={carrier} size="lg" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-800">{carrier.name}</span>
                  {carrier.website_url && (
                    <a
                      href={carrier.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-700"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span>{countryCount} {countryCount === 1 ? 'země' : countryCount < 5 ? 'země' : 'zemí'}</span>
                  <span>·</span>
                  <span>{activeContracts.length} aktivních smluv</span>
                  {salesRep && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <User className="h-2.5 w-2.5" />
                        {salesRep}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Country flags preview */}
                <div className="flex items-center gap-1">
                  {rows.slice(0, 6).map((cc) => (
                    <FlagImage key={cc.id} code={cc.country?.code ?? ''} className="h-4 w-auto" />
                  ))}
                  {rows.length > 6 && <span className="text-[10px] text-gray-400">+{rows.length - 6}</span>}
                </div>
                {/* Status indicators */}
                {hasExpired && (
                  <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]" variant="outline">!</Badge>
                )}
                {hasExpiring && !hasExpired && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]" variant="outline">
                    <Clock className="h-2.5 w-2.5" />
                  </Badge>
                )}
                {isExpanded
                  ? <ChevronDown className="h-4 w-4 text-gray-400" />
                  : <ChevronRight className="h-4 w-4 text-gray-400" />
                }
              </div>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <CardContent className="px-0 pt-0 pb-0 border-t border-gray-100">
                {/* Sales rep info */}
                <div className="px-5 py-3 bg-gray-50/50 flex items-center gap-4 text-xs border-b border-gray-100">
                  <span className="font-medium text-gray-600">Obchodní zástupce:</span>
                  {salesRep ? (
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1 text-gray-700">
                        <User className="h-3 w-3 text-gray-400" />
                        {salesRep}
                      </span>
                      {carrier.sales_rep_email && (
                        <a href={`mailto:${carrier.sales_rep_email}`} className="flex items-center gap-1 text-blue-600 hover:text-blue-800">
                          <Mail className="h-3 w-3" />
                          {carrier.sales_rep_email}
                        </a>
                      )}
                      {carrier.sales_rep_phone && (
                        <a href={`tel:${carrier.sales_rep_phone}`} className="flex items-center gap-1 text-blue-600 hover:text-blue-800">
                          <Phone className="h-3 w-3" />
                          {carrier.sales_rep_phone}
                        </a>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400">Nezadáno</span>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs gap-1 border-blue-200 text-blue-600 hover:bg-blue-50"
                      onClick={() => setUploadCarrier(carrier)}
                    >
                      <Sparkles className="h-2.5 w-2.5" />
                      Nahrát ceník (PDF)
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => openRepEdit(carrier)}
                    >
                      <Pencil className="h-2.5 w-2.5 mr-1" />
                      Upravit
                    </Button>
                  </div>
                </div>

                {/* Contracts table */}
                <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/30">
                      <th className="text-left font-medium text-gray-400 px-5 py-2">Země / E-shop</th>
                      <th className="text-left font-medium text-gray-400 px-4 py-2">Smlouva od</th>
                      <th className="text-left font-medium text-gray-400 px-4 py-2">Smlouva do</th>
                      <th className="text-left font-medium text-gray-400 px-4 py-2">Stav</th>
                      <th className="text-left font-medium text-gray-400 px-4 py-2">Poznámky</th>
                      <th className="text-center font-medium text-gray-400 px-4 py-2">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((cc) => (
                      <tr key={cc.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-2.5">
                          <div className="font-medium text-gray-800 flex items-center gap-1.5">
                            <FlagImage code={cc.country?.code ?? ''} />
                            {cc.country?.code}
                          </div>
                          <div className="text-gray-400 text-[10px]">{cc.country?.eshop_url}</div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {cc.contract_start
                            ? format(parseISO(cc.contract_start), 'd. M. yyyy', { locale: cs })
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {cc.contract_end
                            ? format(parseISO(cc.contract_end), 'd. M. yyyy', { locale: cs })
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                        <td className="px-4 py-2.5">
                          <ContractStatus end={cc.contract_end ?? null} />
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 max-w-xs truncate">
                          {cc.contract_notes ?? <span className="text-gray-200">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(cc)}>
                            <Pencil className="h-3 w-3 text-gray-400" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>

                {/* Carrier pricing breakdown */}
                {carrierBPs.length > 0 && (
                  <div className="border-t border-gray-100">
                    <div className="px-5 py-2.5 text-xs font-medium text-gray-500 bg-gray-50/30">
                      Ceník dopravce ({carrierBPs.length} položek) <span className="text-gray-400 font-normal">· ceny v CZK</span>
                    </div>
                    <div className="px-5 pb-4 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="text-left font-medium text-gray-400 py-2 pr-4">Země</th>
                            <th className="text-left font-medium text-gray-400 py-2 pr-4">Typ</th>
                            <th className="text-right font-medium text-gray-400 py-2 pr-4">Základ</th>
                            <th className="text-right font-medium text-gray-400 py-2 pr-4">Palivo</th>
                            <th className="text-right font-medium text-gray-400 py-2 pr-4">Mýto</th>
                            <th className="text-right font-medium text-gray-400 py-2 pr-4">Dobírka</th>
                            <th className="text-right font-medium text-gray-400 py-2 pr-4">Celkem</th>
                            <th className="text-left font-medium text-gray-400 py-2">Platnost do</th>
                          </tr>
                        </thead>
                        <tbody>
                          {carrierBPs.map((bp) => {
                            const cc = rows.find((c) => c.id === bp.country_carrier_id)
                            if (!cc?.country) return null
                            const country = cc.country
                            const cur = country.currency as Currency
                            // Carrier price lists are denominated in CZK, so show every
                            // value here in CZK (not converted to the country's currency).
                            const bpCZK = toCZK(bp.base_price, bp.currency as Currency, exchangeRates)

                            let fuel = 0, toll = 0, cod = 0
                            if (!bp.surcharges_included) {
                              const ccSurcharges = surcharges.filter((s) => s.country_carrier_id === cc.id)
                              ccSurcharges.forEach((s) => {
                                let amt = 0
                                if (s.is_percentage) {
                                  amt = bpCZK * (s.value / 100)
                                } else {
                                  const srcCur = (s.currency ?? cur) as Currency
                                  amt = toCZK(s.value, srcCur, exchangeRates)
                                }
                                if (s.type === 'fuel') fuel += amt
                                else if (s.type === 'toll') toll += amt
                                else if (s.type === 'cod' || s.type === 'cod_card') cod += amt
                              })
                            }
                            const total = bpCZK + fuel + toll + cod

                            return (
                              <tr key={bp.id} className="border-b border-gray-50 hover:bg-gray-50">
                                <td className="py-2 pr-4">
                                  <div className="flex items-center gap-1.5">
                                    <FlagImage code={country.code} />
                                    <span className="font-medium text-gray-700">{country.code}</span>
                                  </div>
                                </td>
                                <td className="py-2 pr-4 text-gray-500">
                                  {bp.delivery_type === 'home' ? 'Domů' : bp.delivery_type === 'pickup' ? 'Výdejní m.' : '—'}
                                  {bp.surcharges_included && (
                                    <span className="ml-1 text-[9px] text-green-600">(vše v ceně)</span>
                                  )}
                                </td>
                                <td className="py-2 pr-4 text-right text-gray-700">{formatCurrency(bpCZK, 'CZK')}</td>
                                <td className="py-2 pr-4 text-right text-orange-600">
                                  {fuel > 0 ? formatCurrency(fuel, 'CZK') : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="py-2 pr-4 text-right text-orange-600">
                                  {toll > 0 ? formatCurrency(toll, 'CZK') : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="py-2 pr-4 text-right text-orange-600">
                                  {cod > 0 ? formatCurrency(cod, 'CZK') : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="py-2 pr-4 text-right font-medium text-gray-800">{formatCurrency(total, 'CZK')}</td>
                                <td className="py-2 text-gray-400">
                                  {bp.valid_to ? format(parseISO(bp.valid_to), 'd. M. yyyy', { locale: cs }) : <span className="text-gray-300">Neomezeno</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )
      })}

      {/* Contract edit dialog */}
      <Dialog open={!!editCC} onOpenChange={() => setEditCC(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-1.5">
              Smlouva — <FlagImage code={editCC?.country?.code ?? ''} /> {editCC?.country?.code} · {editCC?.carrier?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Platnost smlouvy od</Label>
              <Input
                type="date"
                value={form.contract_start}
                onChange={(e) => setForm((f) => ({ ...f, contract_start: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Platnost smlouvy do</Label>
              <Input
                type="date"
                value={form.contract_end}
                onChange={(e) => setForm((f) => ({ ...f, contract_end: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Poznámky (volitelné)</Label>
              <Input
                placeholder="např. číslo smlouvy, kontaktní osoba…"
                value={form.contract_notes}
                onChange={(e) => setForm((f) => ({ ...f, contract_notes: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditCC(null)} disabled={saving}>Zrušit</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Ukládám…' : 'Uložit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sales rep edit dialog */}
      <Dialog open={!!editCarrier} onOpenChange={() => setEditCarrier(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-1.5">
              Obchodní zástupce — {editCarrier?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Jméno</Label>
              <Input
                placeholder="Jan Novák"
                value={repForm.sales_rep_name}
                onChange={(e) => setRepForm((f) => ({ ...f, sales_rep_name: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">E-mail</Label>
              <Input
                type="email"
                placeholder="jan.novak@dopravce.cz"
                value={repForm.sales_rep_email}
                onChange={(e) => setRepForm((f) => ({ ...f, sales_rep_email: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Telefon</Label>
              <Input
                type="tel"
                placeholder="+420 123 456 789"
                value={repForm.sales_rep_phone}
                onChange={(e) => setRepForm((f) => ({ ...f, sales_rep_phone: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditCarrier(null)} disabled={saving}>Zrušit</Button>
            <Button size="sm" onClick={handleRepSave} disabled={saving}>
              {saving ? 'Ukládám…' : 'Uložit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price-list PDF upload + AI parse dialog */}
      {uploadCarrier && (
        <PriceListUploadDialog
          carrier={uploadCarrier}
          countryCarriers={countryCarriers}
          onClose={() => setUploadCarrier(null)}
        />
      )}
    </div>
  )
}
