import { Suspense } from 'react'
import { Header } from '@/components/layout/header'
import { MarketDashboard } from '@/components/market/market-dashboard'
import type { CompetitorPrice } from '@/components/market/market-dashboard'
import { Badge } from '@/components/ui/badge'
import { getCountries, getCustomerPrices } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'

export const revalidate = 0

async function getCompetitorPrices(): Promise<CompetitorPrice[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('competitor_prices')
    .select('*')
    .order('checked_at', { ascending: false })
  if (error) { console.error(error); return [] }
  return (data ?? []) as CompetitorPrice[]
}

async function MarketContent() {
  const [countries, customerPrices, competitorPrices] = await Promise.all([
    getCountries(),
    getCustomerPrices(),
    getCompetitorPrices(),
  ])

  // Build OurRoute[] from customer prices with nested country_carrier data
  const ourRoutes = customerPrices
    .filter(cp => cp.country_carrier?.carrier && cp.country_carrier?.country)
    .map(cp => {
      const cc = cp.country_carrier!
      const carrier = cc.carrier!
      return {
        country_carrier_id: cp.country_carrier_id,
        country_id: cc.country_id,
        carrier_code: carrier.code,
        carrier_name: carrier.code, // use code as canonical carrier_name for matching
        carrier_color: carrier.logo_color ?? '#666',
        delivery_type: cp.delivery_type as 'home' | 'pickup',
        service_name: cp.service_name,
        price: cp.price,
        currency: cp.currency,
      }
    })

  return (
    <MarketDashboard
      countries={countries}
      ourRoutes={ourRoutes}
      competitorPrices={competitorPrices}
    />
  )
}

export default function TrhPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Průzkum trhu"
        description="Srovnání cen dopravy s konkurencí ve fashion segmentu"
        badge={
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 py-0 bg-purple-50 border-purple-200 text-purple-700 font-medium">
            fashion e-shopy
          </Badge>
        }
      />
      <div className="flex-1 overflow-y-auto p-5">
        <Suspense fallback={<div className="h-64 rounded-xl bg-gray-100 animate-pulse" />}>
          <MarketContent />
        </Suspense>
      </div>
    </div>
  )
}
