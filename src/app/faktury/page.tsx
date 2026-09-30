import { Suspense } from 'react'
import { Header } from '@/components/layout/header'
import { InvoiceManager } from '@/components/invoices/invoice-manager'
import { getInvoices, getCountryCarriers } from '@/lib/data'

export const revalidate = 300

async function InvoicesContent() {
  const [invoices, countryCarriers] = await Promise.all([
    getInvoices(),
    getCountryCarriers(),
  ])
  return <InvoiceManager invoices={invoices} countryCarriers={countryCarriers} />
}

export default function FakturaPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Faktury"
        description="Controlling skutečných vs. smluvních nákladů"
      />
      <div className="flex-1 overflow-y-auto p-5">
        <Suspense fallback={<div className="h-64 rounded-xl bg-gray-100 animate-pulse" />}>
          <InvoicesContent />
        </Suspense>
      </div>
    </div>
  )
}
