import { Suspense } from 'react'
import { Header } from '@/components/layout/header'
import { MarginCalculator } from '@/components/calculator/margin-calculator'
import { Badge } from '@/components/ui/badge'
import { getProfitabilityMatrix, getExchangeRates, getBalikobotStats } from '@/lib/data'

export const revalidate = 0

async function CalculatorContent() {
  const [matrix, rates, rawStats] = await Promise.all([
    getProfitabilityMatrix(2),
    getExchangeRates(),
    getBalikobotStats(),
  ])

  // Aggregate last 12 months of shipments by country_id + carrier_id + delivery_type
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - 12)
  const cutoff = cutoffDate.toISOString().slice(0, 7)

  const volumeMap: Record<string, number> = {}
  for (const s of rawStats) {
    if (s.month < cutoff || !s.delivery_type) continue
    const key = `${s.country_id}__${s.carrier_id}__${s.delivery_type}`
    volumeMap[key] = (volumeMap[key] ?? 0) + s.shipment_count
  }

  return (
    <MarginCalculator matrix={matrix} exchangeRates={rates} volumeMap={volumeMap} />
  )
}

export default function KalkulackaPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Kalkulačka marží"
        description="Simulace změny cen a export srovnání pro rozhodování"
        badge={
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 py-0 bg-emerald-50 border-emerald-200 text-emerald-600 font-medium">
            při 2 kg zásilce
          </Badge>
        }
      />
      <div className="flex-1 overflow-y-auto p-5">
        <Suspense fallback={<div className="h-64 rounded-xl bg-gray-100 animate-pulse" />}>
          <CalculatorContent />
        </Suspense>
      </div>
    </div>
  )
}
