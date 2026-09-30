'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Upload, FileText, Sparkles, AlertTriangle } from 'lucide-react'
import type { Carrier, CountryCarrier } from '@/types'

interface ExtractedRow {
  country_code: string
  delivery_type: 'home' | 'pickup' | 'unknown'
  service_name: string
  weight_from: number
  weight_to: number
  base_price: number
  currency: string
}

interface ReviewRow extends ExtractedRow {
  include: boolean
}

const INPUT_CLS = 'border border-gray-200 rounded px-1.5 py-0.5 text-[11px] focus:ring-1 focus:ring-blue-400/30 focus:outline-none'

export function PriceListUploadDialog({
  carrier,
  countryCarriers,
  onClose,
}: {
  carrier: Carrier
  countryCarriers: CountryCarrier[]
  onClose: () => void
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<'upload' | 'review'>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ReviewRow[]>([])

  // Active routes for this carrier, indexed by country code, so we can map each
  // extracted row to a country_carrier_id (and flag rows with no matching route).
  const routeByCountry = useMemo(() => {
    const map = new Map<string, CountryCarrier>()
    for (const cc of countryCarriers) {
      if (cc.carrier_id === carrier.id && cc.country?.code) map.set(cc.country.code, cc)
    }
    return map
  }, [countryCarriers, carrier.id])

  async function handleFile(file: File) {
    setError(null)
    setFileName(file.name)
    setParsing(true)
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Nepodařilo se načíst soubor'))
        reader.readAsDataURL(file)
      })
      const pdfBase64 = dataUrl.split(',')[1] ?? ''

      const res = await fetch('/api/parse-pricelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64, carrierCode: carrier.code, carrierName: carrier.name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Chyba při čtení PDF')

      const parsed: ExtractedRow[] = data.rows ?? []
      if (parsed.length === 0) {
        setError('V dokumentu se nepodařilo najít žádné ceny.')
        return
      }
      setRows(parsed.map((r) => ({ ...r, country_code: (r.country_code ?? '').toUpperCase(), include: true })))
      setPhase('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Neznámá chyba')
    } finally {
      setParsing(false)
    }
  }

  function update(idx: number, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const includable = rows.filter((r) => r.include && routeByCountry.has(r.country_code))

  async function handleSave() {
    if (includable.length === 0) {
      toast.error('Žádné řádky k uložení (chybí odpovídající trasa).')
      return
    }
    setSaving(true)
    try {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]
      const inserts = includable.map((r) => ({
        country_carrier_id: routeByCountry.get(r.country_code)!.id,
        weight_from: r.weight_from,
        weight_to: r.weight_to,
        base_price: r.base_price,
        currency: r.currency || 'CZK',
        delivery_type: r.delivery_type === 'unknown' ? null : r.delivery_type,
        service_name: r.service_name.trim() || null,
        surcharges_included: false,
        valid_from: today,
      }))
      const { error: insErr } = await supabase.from('carrier_base_prices').insert(inserts)
      if (insErr) throw insErr
      toast.success(`Uloženo ${inserts.length} cen — propsáno do ceníku`)
      router.refresh()
      onClose()
    } catch (err) {
      toast.error('Chyba při ukládání cen')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={() => !parsing && !saving && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-500" />
            Nahrát ceník (PDF) — {carrier.name}
          </DialogTitle>
        </DialogHeader>

        {phase === 'upload' && (
          <div className="space-y-3 py-2">
            <p className="text-xs text-gray-500">
              Nahrajte aktuální PDF ceník dopravce. Ceny se vyčtou pomocí AI, zobrazí se ke kontrole
              a po potvrzení se zapíšou do cen dopravce (propíše se i do sekce Ceník).
            </p>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl py-10 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
              <Upload className="h-6 w-6 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">
                {parsing ? 'Čtu dokument…' : 'Vyberte PDF soubor'}
              </span>
              {fileName && <span className="text-[11px] text-gray-400 flex items-center gap-1"><FileText className="h-3 w-3" />{fileName}</span>}
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={parsing}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
            </label>
            {error && (
              <p className="text-xs text-red-600 bg-red-50 rounded-md px-2.5 py-2 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{error}
              </p>
            )}
          </div>
        )}

        {phase === 'review' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Zkontrolujte a upravte vyčtené ceny. Uloží se jen zaškrtnuté řádky, které mají v systému
              odpovídající trasu (země × {carrier.code}).
            </p>
            <div className="max-h-[50vh] overflow-y-auto border border-gray-100 rounded-lg">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-gray-50/90 backdrop-blur">
                  <tr className="border-b border-gray-100 text-gray-400">
                    <th className="px-2 py-1.5 w-8"></th>
                    <th className="px-2 py-1.5 text-left">Země</th>
                    <th className="px-2 py-1.5 text-left">Doručení</th>
                    <th className="px-2 py-1.5 text-left">Služba</th>
                    <th className="px-2 py-1.5 text-right">Od kg</th>
                    <th className="px-2 py-1.5 text-right">Do kg</th>
                    <th className="px-2 py-1.5 text-right">Cena</th>
                    <th className="px-2 py-1.5 text-left">Měna</th>
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const hasRoute = routeByCountry.has(r.country_code)
                    return (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-2 py-1 text-center">
                          <input type="checkbox" checked={r.include && hasRoute} disabled={!hasRoute}
                            onChange={(e) => update(i, { include: e.target.checked })} />
                        </td>
                        <td className="px-2 py-1">
                          <input className={`${INPUT_CLS} w-12 uppercase`} value={r.country_code}
                            onChange={(e) => update(i, { country_code: e.target.value.toUpperCase() })} />
                        </td>
                        <td className="px-2 py-1">
                          <select className={INPUT_CLS} value={r.delivery_type}
                            onChange={(e) => update(i, { delivery_type: e.target.value as ReviewRow['delivery_type'] })}>
                            <option value="home">Domů</option>
                            <option value="pickup">Výdejní místo</option>
                            <option value="unknown">—</option>
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <input className={`${INPUT_CLS} w-28`} value={r.service_name}
                            onChange={(e) => update(i, { service_name: e.target.value })} />
                        </td>
                        <td className="px-2 py-1 text-right">
                          <input type="number" step="0.01" className={`${INPUT_CLS} w-14 text-right`} value={r.weight_from}
                            onChange={(e) => update(i, { weight_from: parseFloat(e.target.value) || 0 })} />
                        </td>
                        <td className="px-2 py-1 text-right">
                          <input type="number" step="0.01" className={`${INPUT_CLS} w-14 text-right`} value={r.weight_to}
                            onChange={(e) => update(i, { weight_to: parseFloat(e.target.value) || 0 })} />
                        </td>
                        <td className="px-2 py-1 text-right">
                          <input type="number" step="0.01" className={`${INPUT_CLS} w-16 text-right`} value={r.base_price}
                            onChange={(e) => update(i, { base_price: parseFloat(e.target.value) || 0 })} />
                        </td>
                        <td className="px-2 py-1">
                          <input className={`${INPUT_CLS} w-12 uppercase`} value={r.currency}
                            onChange={(e) => update(i, { currency: e.target.value.toUpperCase() })} />
                        </td>
                        <td className="px-2 py-1">
                          {!hasRoute && (
                            <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-600 text-[9px] px-1.5 py-0 h-4">
                              není trasa
                            </Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-400">
              K uložení: <span className="font-semibold text-gray-600">{includable.length}</span> z {rows.length} řádků.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={parsing || saving}>Zrušit</Button>
          {phase === 'review' && (
            <Button size="sm" onClick={handleSave} disabled={saving || includable.length === 0}>
              {saving ? 'Ukládám…' : `Uložit ${includable.length} cen`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
