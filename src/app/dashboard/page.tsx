import { Suspense } from 'react'
import { Header } from '@/components/layout/header'
import { MarginChart } from '@/components/dashboard/margin-chart'
import { TopLosses } from '@/components/dashboard/top-losses'
import { SurchargeAlert } from '@/components/dashboard/surcharge-alert'
import { CountrySummary } from '@/components/dashboard/country-summary'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getProfitabilityMatrix, getCarrierSurcharges } from '@/lib/data'
import { Grid3X3, Map } from 'lucide-react'

export const revalidate = 300

async function DashboardContent() {
  const [matrix, carrierSurcharges] = await Promise.all([
    getProfitabilityMatrix(2),
    getCarrierSurcharges(),
  ])

  return (
    <div className="space-y-4">
      {/* Country health overview — hero section */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-1.5 pt-3.5 px-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-md bg-indigo-50 flex items-center justify-center">
              <Map className="h-3 w-3 text-indigo-500" />
            </div>
            <CardTitle className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Zdraví dle země
            </CardTitle>
            <span className="text-[9px] text-gray-400 ml-auto">řazeno od nejhorší marže</span>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <CountrySummary data={matrix} />
        </CardContent>
      </Card>

      {/* Fuel surcharges — by carrier with logos */}
      {carrierSurcharges.some((s) => s.type === 'fuel') && (
        <SurchargeAlert carrierSurcharges={carrierSurcharges} />
      )}

      {/* Heatmap + Top losses */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader className="pb-1.5 pt-3.5 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-md bg-blue-50 flex items-center justify-center">
                  <Grid3X3 className="h-3 w-3 text-blue-500" />
                </div>
                <CardTitle className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Matice marží
                </CardTitle>
              </div>
              <span className="text-[9px] text-gray-400 bg-gray-50 rounded-md px-2 py-0.5">do 2 kg</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <MarginChart data={matrix} />
          </CardContent>
        </Card>

        <TopLosses data={matrix} />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Přehled"
        description="Klíčové metriky dopravních nákladů a ziskovosti"
      />
      <div className="flex-1 overflow-y-auto p-5">
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent />
        </Suspense>
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-32 rounded-xl bg-gray-100" />
      <div className="h-20 rounded-xl bg-gray-100" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-72 rounded-xl bg-gray-100" />
        <div className="h-72 rounded-xl bg-gray-100" />
      </div>
    </div>
  )
}
