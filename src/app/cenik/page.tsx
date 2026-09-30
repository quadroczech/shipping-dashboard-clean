import { Suspense } from 'react'
import { Header } from '@/components/layout/header'
import { PricingTable } from '@/components/pricing/pricing-table'
import { Badge } from '@/components/ui/badge'
import { getAllCountryCarriers, getCustomerPrices, getCarrierBasePrices, getReturnPrices, getSurcharges, getCarrierSurcharges, getExchangeRates, getCountries, getCarriers } from '@/lib/data'

export const revalidate = 0

async function PricingContent() {
  const [countryCarriers, customerPrices, basePrices, returnPrices, surcharges, carrierSurcharges, rates, countries, carriers] = await Promise.all([
    getAllCountryCarriers(),
    getCustomerPrices(),
    getCarrierBasePrices(2),
    getReturnPrices(),
    getSurcharges(),
    getCarrierSurcharges(),
    getExchangeRates(),
    getCountries(),
    getCarriers(),
  ])

  return (
    <PricingTable
      countryCarriers={countryCarriers}
      customerPrices={customerPrices}
      basePrices={basePrices}
      returnPrices={returnPrices}
      surcharges={surcharges}
      carrierSurcharges={carrierSurcharges}
      exchangeRates={rates}
      allCountries={countries}
      allCarriers={carriers}
    />
  )
}

export default function CenikPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Ceník"
        description="Klikněte na tužku u řádku pro rychlou editaci cen"
        badge={
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 py-0 bg-blue-50 border-blue-200 text-blue-600 font-medium">
            Marže se přepočítá automaticky
          </Badge>
        }
      />
      <div className="flex-1 overflow-y-auto p-5">
        <Suspense fallback={<div className="h-64 rounded-xl bg-gray-100 animate-pulse" />}>
          <PricingContent />
        </Suspense>
      </div>
    </div>
  )
}
