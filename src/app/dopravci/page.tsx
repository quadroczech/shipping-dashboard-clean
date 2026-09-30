import { Suspense } from 'react'
import { Header } from '@/components/layout/header'
import { ContractsManager } from '@/components/carriers/contracts-manager'
import { getCountryCarriers, getCarriers, getCountries, getCarrierBasePrices, getSurcharges, getExchangeRates } from '@/lib/data'

export const revalidate = 300

async function ContractsContent() {
  const [countryCarriers, carriers, countries, basePrices, surcharges, exchangeRates] = await Promise.all([
    getCountryCarriers(),
    getCarriers(),
    getCountries(),
    getCarrierBasePrices(),
    getSurcharges(),
    getExchangeRates(),
  ])
  return (
    <ContractsManager
      countryCarriers={countryCarriers}
      carriers={carriers}
      countries={countries}
      basePrices={basePrices}
      surcharges={surcharges}
      exchangeRates={exchangeRates}
    />
  )
}

export default function DopravciPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Dopravci"
        description="Smluvní ceny, příplatky, platnost smluv"
      />
      <div className="flex-1 overflow-y-auto p-5">
        <Suspense fallback={<div className="h-64 rounded-xl bg-gray-100 animate-pulse" />}>
          <ContractsContent />
        </Suspense>
      </div>
    </div>
  )
}
