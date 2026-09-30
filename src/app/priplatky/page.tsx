import { Suspense } from 'react'
import { Header } from '@/components/layout/header'
import { CarrierSurchargeManager } from '@/components/surcharges/carrier-surcharge-manager'
import { getCarriers, getAllCarrierSurcharges, getSurcharges, getCountryCarriers } from '@/lib/data'

export const revalidate = 0

async function PriplatkyContent() {
  const [carriers, carrierSurcharges, surcharges, countryCarriers] = await Promise.all([
    getCarriers(),
    getAllCarrierSurcharges(),
    getSurcharges(),
    getCountryCarriers(),
  ])
  const codSurcharges = surcharges.filter((s) => s.type === 'cod' || s.type === 'cod_card')
  return (
    <CarrierSurchargeManager
      carriers={carriers}
      carrierSurcharges={carrierSurcharges}
      codSurcharges={codSurcharges}
      countryCarriers={countryCarriers}
    />
  )
}

export default function PriplatkyPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Příplatky"
        description="Palivový a mýtný příplatek dle dopravce — správa a historie"
      />
      <div className="flex-1 overflow-y-auto p-5">
        <Suspense fallback={<div className="h-64 rounded-xl bg-gray-100 animate-pulse" />}>
          <PriplatkyContent />
        </Suspense>
      </div>
    </div>
  )
}
