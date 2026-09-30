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
import {
  Plus, Upload, FileText, CheckCircle,
  AlertTriangle, TrendingUp, TrendingDown,
} from 'lucide-react'
import type { Invoice, CountryCarrier, Currency } from '@/types'
import { formatCurrency } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import { cs } from 'date-fns/locale'

interface InvoiceManagerProps {
  invoices: Invoice[]
  countryCarriers: CountryCarrier[]
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Čeká na zpracování', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  processing: { label: 'Zpracovává se',       color: 'bg-blue-100 text-blue-700 border-blue-200' },
  parsed:     { label: 'Rozpoznáno',          color: 'bg-purple-100 text-purple-700 border-purple-200' },
  reviewed:   { label: 'Zkontrolováno',       color: 'bg-amber-100 text-amber-700 border-amber-200' },
  approved:   { label: 'Schváleno',           color: 'bg-green-100 text-green-700 border-green-200' },
}

export function InvoiceManager({ invoices, countryCarriers }: InvoiceManagerProps) {
  const router = useRouter()
  const supabase = createClient()
  const [filterMonth, setFilterMonth] = useState('all')
  const [filterCarrier, setFilterCarrier] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    country_carrier_id: '',
    invoice_number: '',
    invoice_date: '',
    period_month: '',
    total_amount: '',
    contracted_total: '',
    shipment_count: '',
    currency: '',
    notes: '',
  })

  const carriers = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>()
    countryCarriers.forEach((cc) => {
      if (cc.carrier) map.set(cc.carrier.code, { code: cc.carrier.code, name: cc.carrier.name })
    })
    return Array.from(map.values())
  }, [countryCarriers])

  const months = useMemo(() => {
    const s = new Set(invoices.map((i) => i.period_month))
    return Array.from(s).sort().reverse()
  }, [invoices])

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const cc = inv.country_carrier as CountryCarrier
      if (filterMonth !== 'all' && inv.period_month !== filterMonth) return false
      if (filterCarrier !== 'all' && cc?.carrier?.code !== filterCarrier) return false
      return true
    })
  }, [invoices, filterMonth, filterCarrier])

  // Stats
  const totalActual = filtered.reduce((s, i) => s + (i.total_amount ?? 0), 0)
  const totalContracted = filtered.reduce((s, i) => s + (i.contracted_total ?? 0), 0)
  const totalVariance = totalActual - totalContracted
  const negativeVariance = filtered.filter((i) => (i.variance_pct ?? 0) > 5).length

  async function handleSave() {
    if (!form.country_carrier_id || !form.invoice_number || !form.total_amount) {
      toast.error('Vyplňte povinná pole')
      return
    }
    setSaving(true)
    try {
      const cc = countryCarriers.find((c) => c.id === form.country_carrier_id)
      const currency = form.currency || cc?.country?.currency || 'EUR'

      const { error } = await supabase.from('invoices').insert({
        country_carrier_id: form.country_carrier_id,
        invoice_number: form.invoice_number,
        invoice_date: form.invoice_date,
        period_month: form.period_month,
        total_amount: parseFloat(form.total_amount),
        contracted_total: form.contracted_total ? parseFloat(form.contracted_total) : null,
        shipment_count: form.shipment_count ? parseInt(form.shipment_count) : null,
        currency,
        notes: form.notes || null,
        status: 'pending',
      })

      if (error) throw error
      toast.success('Faktura přidána')
      setDialogOpen(false)
      router.refresh()
    } catch (err) {
      toast.error('Chyba při ukládání')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from('invoices').update({ status }).eq('id', id)
    if (error) { toast.error('Chyba'); return }
    toast.success('Stav aktualizován')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <Select value={filterMonth} onValueChange={(v) => setFilterMonth(v ?? 'all')}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Všechny měsíce" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny měsíce</SelectItem>
            {months.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCarrier} onValueChange={(v) => setFilterCarrier(v ?? 'all')}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="Všichni dopravci" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všichni dopravci</SelectItem>
            {carriers.map((c) => (
              <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" className="ml-auto h-8" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Přidat fakturu
        </Button>
      </div>

      {/* Summary cards */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="border-0 shadow-sm">
            <CardContent className="px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Skutečné náklady</p>
              <p className="text-xl font-bold text-gray-800 mt-0.5">{totalActual.toFixed(0)} {filtered[0]?.currency}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Smluvní náklady</p>
              <p className="text-xl font-bold text-gray-600 mt-0.5">
                {totalContracted > 0 ? `${totalContracted.toFixed(0)} ${filtered[0]?.currency}` : '—'}
              </p>
            </CardContent>
          </Card>
          <Card className={`border-0 shadow-sm ${totalVariance > 0 ? 'bg-red-50' : totalVariance < 0 ? 'bg-green-50' : ''}`}>
            <CardContent className="px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Odchylka (přeplatek)</p>
              <p className={`text-xl font-bold mt-0.5 flex items-center gap-1 ${totalVariance > 0 ? 'text-red-600' : totalVariance < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                {totalVariance > 0 ? <TrendingUp className="h-4 w-4" /> : totalVariance < 0 ? <TrendingDown className="h-4 w-4" /> : null}
                {totalContracted > 0
                  ? `${totalVariance >= 0 ? '+' : ''}${totalVariance.toFixed(0)}`
                  : '—'
                }
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Invoices table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70">
                  <th className="text-left font-medium text-gray-400 px-4 py-3">Faktura</th>
                  <th className="text-left font-medium text-gray-400 px-4 py-3">Období</th>
                  <th className="text-left font-medium text-gray-400 px-4 py-3">Dopravce / Země</th>
                  <th className="text-right font-medium text-gray-400 px-4 py-3">Skutečná částka</th>
                  <th className="text-right font-medium text-gray-400 px-4 py-3">Smluvní částka</th>
                  <th className="text-right font-medium text-gray-400 px-4 py-3">Odchylka</th>
                  <th className="text-right font-medium text-gray-400 px-4 py-3">Zásilek</th>
                  <th className="text-left font-medium text-gray-400 px-4 py-3">Stav</th>
                  <th className="text-center font-medium text-gray-400 px-4 py-3">Schválit</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv, i) => {
                  const cc = inv.country_carrier as CountryCarrier
                  const pct = inv.variance_pct
                  return (
                    <tr key={inv.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/20'}`}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-800">{inv.invoice_number}</div>
                        <div className="text-gray-400 text-[10px]">
                          {inv.invoice_date ? format(parseISO(inv.invoice_date), 'd. M. yyyy', { locale: cs }) : '—'}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{inv.period_month}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className="rounded px-1.5 py-0.5 text-white text-[10px] font-semibold mr-1"
                          style={{ backgroundColor: cc?.carrier?.logo_color ?? '#666' }}
                        >
                          {cc?.carrier?.code ?? '?'}
                        </span>
                        <span className="text-gray-600">{cc?.country?.flag} {cc?.country?.code}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-800">
                        {formatCurrency(inv.total_amount, inv.currency as Currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500">
                        {inv.contracted_total
                          ? formatCurrency(inv.contracted_total, inv.currency as Currency)
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {pct != null ? (
                          <span className={`font-semibold ${pct > 5 ? 'text-red-600' : pct < -2 ? 'text-green-600' : 'text-gray-600'}`}>
                            {pct > 0 ? '+' : ''}{pct.toFixed(1)} %
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500">
                        {inv.shipment_count?.toLocaleString('cs-CZ') ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={`text-[10px] ${STATUS_LABELS[inv.status]?.color ?? ''}`}>
                          {STATUS_LABELS[inv.status]?.label ?? inv.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {inv.status !== 'approved' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:text-green-600"
                            onClick={() => updateStatus(inv.id, 'approved')}
                            title="Schválit"
                          >
                            <CheckCircle className="h-3.5 w-3.5 text-gray-400" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                      Žádné faktury — přidejte první pomocí tlačítka výše
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add invoice dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Přidat fakturu dopravce</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Dopravce / Země *</Label>
              <Select
                value={form.country_carrier_id}
                onValueChange={(v) => {
                  const id = v ?? ''
                  const cc = countryCarriers.find((c) => c.id === id)
                  setForm((f) => ({ ...f, country_carrier_id: id, currency: cc?.country?.currency ?? '' }))
                }}
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Číslo faktury *</Label>
                <Input
                  placeholder="FV2025001"
                  value={form.invoice_number}
                  onChange={(e) => setForm((f) => ({ ...f, invoice_number: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Datum faktury</Label>
                <Input
                  type="date"
                  value={form.invoice_date}
                  onChange={(e) => setForm((f) => ({ ...f, invoice_date: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fakturační období (RRRR-MM)</Label>
                <Input
                  placeholder="2025-01"
                  value={form.period_month}
                  onChange={(e) => setForm((f) => ({ ...f, period_month: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Měna</Label>
                <Input
                  placeholder="CZK"
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Skutečná částka *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.total_amount}
                  onChange={(e) => setForm((f) => ({ ...f, total_amount: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Smluvní částka (očekávaná)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.contracted_total}
                  onChange={(e) => setForm((f) => ({ ...f, contracted_total: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Počet zásilek (z faktury)</Label>
              <Input
                type="number"
                placeholder="0"
                value={form.shipment_count}
                onChange={(e) => setForm((f) => ({ ...f, shipment_count: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Poznámky</Label>
              <Input
                placeholder="Volitelné"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>

            <p className="text-[10px] text-gray-400 flex items-center gap-1">
              <Upload className="h-3 w-3" />
              Nahrání PDF / Excel souboru faktury bude dostupné brzy
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>Zrušit</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Ukládám…' : 'Uložit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
