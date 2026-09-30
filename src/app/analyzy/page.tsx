import { Suspense } from 'react'
import { Header } from '@/components/layout/header'
import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard'
import {
  getProfitabilityMatrix,
  getAllCarrierSurcharges,
  getBalikobotStats,
  getActiveRouteKeys,
  getCarriers,
  getCountries,
} from '@/lib/data'

export const revalidate = 300

async function AnalyticsContent() {
  const [matrix, carrierSurcharges, allShipmentStats, activeRouteKeys, carriers, countries] = await Promise.all([
    getProfitabilityMatrix(2),
    getAllCarrierSurcharges(),
    getBalikobotStats(),
    getActiveRouteKeys(),
    getCarriers(),
    getCountries(),
  ])

  // Drop shipments of deactivated routes from all analytics — the raw history
  // stays visible on /zasilky (those parcels really were sent), but utilization
  // and surcharge-impact numbers here must reflect only routes still in use.
  const shipmentStats = allShipmentStats.filter(
    (s) => activeRouteKeys.has(`${s.country_id}|${s.carrier_id}`),
  )

  return (
    <AnalyticsDashboard
      matrix={matrix}
      carrierSurcharges={carrierSurcharges}
      shipmentStats={shipmentStats}
      carriers={carriers}
      countries={countries}
    />
  )
}

export default function AnalyzyPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Analýzy"
        description="Trendy, příplatky, srovnání dopravců"
      />
      <div className="flex-1 overflow-y-auto p-5">
        <Suspense fallback={
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-gray-100" />)}
            </div>
            <div className="h-72 rounded-xl bg-gray-100" />
          </div>
        }>
          <AnalyticsContent />
        </Suspense>
      </div>
    </div>
  )
}
