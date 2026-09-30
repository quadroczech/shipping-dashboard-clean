'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, GitBranch, Plus, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Carrier, LokiaBranchMap, UnmappedBranch } from '@/types'

interface Props {
  unmapped: UnmappedBranch[]
  mappings: LokiaBranchMap[]
  carriers: Carrier[]
}

const FIELD = 'w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-blue-400/30 focus:outline-none'
const LABEL = 'text-[11px] font-semibold text-gray-500 uppercase tracking-wide'

type Draft = {
  country_code: string
  branch_id: string
  is_prefix: boolean
  carrier_code: string
  delivery_type: string
  last_mile_carrier: string
}

export function BranchMappingPanel({ unmapped, mappings, carriers }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(unmapped.length > 0)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  const startMap = (b?: UnmappedBranch) => setDraft({
    country_code: b?.country_code ?? '',
    branch_id: b?.branch_id ?? '',
    is_prefix: false,
    carrier_code: carriers[0]?.code ?? '',
    delivery_type: '',
    last_mile_carrier: '',
  })

  const save = async () => {
    if (!draft) return
    if (!draft.branch_id.trim() || !draft.carrier_code) {
      toast.error('Vyplň BranchId a dopravce')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/branch-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country_code: draft.country_code || null,
          branch_id: draft.branch_id.trim(),
          is_prefix: draft.is_prefix,
          carrier_code: draft.carrier_code,
          delivery_type: draft.delivery_type || null,
          last_mile_carrier: draft.last_mile_carrier.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      toast.success(`Mapování uloženo — přepočítáno ${json.months} měsíců`)
      setDraft(null)
      router.refresh()
    } catch (e) {
      toast.error(`Uložení selhalo: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const totalUnmappedDocs = unmapped.reduce((s, b) => s + b.doc_count, 0)

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-5 py-3 text-left hover:bg-gray-50/50 transition-colors"
      >
        <GitBranch className="h-4 w-4 text-gray-400" />
        <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-widest">
          Mapování sub-dopravců (Packeta BranchId)
        </span>
        {unmapped.length > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            {unmapped.length} nezařazených · {totalUnmappedDocs.toLocaleString('cs-CZ')} zásilek
          </span>
        )}
        <ChevronDown className={cn('h-4 w-4 text-gray-400 ml-auto transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-5 pb-4 pt-1 space-y-4 border-t border-gray-50">
          {/* Unmapped branches */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-gray-400">
                Zásilkovna konsoliduje více dopravců (FAN, Sameday…) pod jedním kódem; Lokia je rozlišuje jen číslem
                <span className="font-mono text-gray-500"> BranchId</span>. Jednotlivá výdejní místa se přiřazují automaticky —
                tady se objeví jen výraznější neznámí dopravci k přiřazení.
              </p>
              <Button size="sm" variant="outline" onClick={() => startMap()} className="shrink-0">
                <Plus className="h-3.5 w-3.5" /> Přidat ručně
              </Button>
            </div>

            {unmapped.length === 0 ? (
              <p className="text-[11px] text-gray-400 italic py-2">
                Žádní neznámí sub-dopravci. Výdejní místa se počítají automaticky; nový výraznější dopravce se zde objeví sám.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {unmapped.slice(0, 40).map((b) => (
                  <button
                    key={`${b.country_code}-${b.branch_id}`}
                    onClick={() => startMap(b)}
                    className="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
                  >
                    <span className="font-semibold text-gray-600">{b.country_code}</span>
                    <span className="font-mono text-gray-700">{b.branch_id}</span>
                    <span className="text-gray-400">{b.doc_count.toLocaleString('cs-CZ')}×</span>
                    <Plus className="h-3 w-3 text-blue-500" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Existing mappings */}
          {mappings.length > 0 && (
            <div>
              <p className={cn(LABEL, 'mb-1.5')}>Aktivní mapování</p>
              <div className="flex flex-wrap gap-1.5">
                {mappings.map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1.5 rounded-md bg-gray-50 border border-gray-100 px-2 py-1 text-[11px] text-gray-600"
                    title={m.note ?? undefined}
                  >
                    <span className="font-semibold">{m.country_code ?? '*'}</span>
                    <span className="font-mono">{m.branch_id}{m.is_prefix ? '*' : ''}</span>
                    <span className="text-gray-300">→</span>
                    <span className="font-semibold text-gray-700">{m.carrier_code}</span>
                    {m.last_mile_carrier && <span className="text-gray-500">· {m.last_mile_carrier}</span>}
                    {m.delivery_type && <span className="text-gray-400">({m.delivery_type})</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mapping dialog */}
      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Přiřadit BranchId dopravci</DialogTitle>
            <DialogDescription>
              Zásilky s tímto BranchId se začnou vypisovat pod zvoleným dopravcem. Historické měsíce se přepočítají.
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className={LABEL}>Země</label>
                <input
                  className={FIELD}
                  value={draft.country_code}
                  placeholder="vše"
                  onChange={(e) => setDraft({ ...draft, country_code: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-1">
                <label className={LABEL}>BranchId</label>
                <input
                  className={cn(FIELD, 'font-mono')}
                  value={draft.branch_id}
                  onChange={(e) => setDraft({ ...draft, branch_id: e.target.value })}
                />
              </div>

              <div className="col-span-2 flex items-center gap-2">
                <input
                  id="is_prefix"
                  type="checkbox"
                  checked={draft.is_prefix}
                  onChange={(e) => setDraft({ ...draft, is_prefix: e.target.checked })}
                  className="h-3.5 w-3.5 accent-blue-600"
                />
                <label htmlFor="is_prefix" className="text-xs text-gray-600">
                  Brát jako <span className="font-semibold">prefix</span> (např. <span className="font-mono">7455-</span> pokryje všechny <span className="font-mono">7455-…</span>)
                </label>
              </div>

              <div className="space-y-1">
                <label className={LABEL}>Dopravce</label>
                <select
                  className={FIELD}
                  value={draft.carrier_code}
                  onChange={(e) => setDraft({ ...draft, carrier_code: e.target.value })}
                >
                  {carriers.map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className={LABEL}>Doručení</label>
                <select
                  className={FIELD}
                  value={draft.delivery_type}
                  onChange={(e) => setDraft({ ...draft, delivery_type: e.target.value })}
                >
                  <option value="">—</option>
                  <option value="home">Domů</option>
                  <option value="pickup">Výdejní místo</option>
                </select>
              </div>

              <div className="col-span-2 space-y-1">
                <label className={LABEL}>Označení (last-mile)</label>
                <input
                  className={FIELD}
                  value={draft.last_mile_carrier}
                  placeholder="např. Sameday"
                  onChange={(e) => setDraft({ ...draft, last_mile_carrier: e.target.value })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={saving} />}>Zrušit</DialogClose>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Uložit a přepočítat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
