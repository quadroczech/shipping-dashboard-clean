import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CarrierBadge } from '@/components/ui/carrier-badge'
import { ExternalLink, Fuel } from 'lucide-react'
import type { CarrierSurcharge } from '@/types'

interface SurchargeAlertProps {
  carrierSurcharges: CarrierSurcharge[]
}

export function SurchargeAlert({ carrierSurcharges }: SurchargeAlertProps) {
  const fuelSurcharges = carrierSurcharges.filter((s) => s.type === 'fuel')
  if (fuelSurcharges.length === 0) return null

  // One entry per carrier (they should already be deduplicated by date filter)
  const byCarrier = new Map<string, CarrierSurcharge>()
  for (const s of fuelSurcharges) {
    if (!s.carrier) continue
    if (!byCarrier.has(s.carrier.code)) byCarrier.set(s.carrier.code, s)
  }
  const items = [...byCarrier.values()]
  if (items.length === 0) return null

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-1.5 pt-3.5 px-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-md bg-amber-50 flex items-center justify-center">
            <Fuel className="h-3 w-3 text-amber-500" />
          </div>
          <CardTitle className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            Palivové příplatky
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {items.map((s) => {
            const linkUrl = s.source_url ?? s.carrier?.fuel_surcharge_url ?? null
            return (
              <div
                key={s.carrier!.code}
                className="rounded-xl border border-amber-200/60 bg-amber-50/40 p-3 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <CarrierBadge carrier={s.carrier!} />
                  <span className="text-lg font-black text-amber-800">
                    {s.is_percentage ? `${s.value}%` : `${s.value}`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[9px] text-amber-600">
                  <span>od {s.valid_from}</span>
                  {linkUrl && (
                    <a
                      href={linkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-0.5 text-amber-500 hover:text-amber-700 transition-colors"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      Zdroj
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
