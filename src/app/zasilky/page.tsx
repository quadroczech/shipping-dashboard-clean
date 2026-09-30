import { Suspense } from 'react'
import { Header } from '@/components/layout/header'
import { getBalikobotStats, getCarriers, getUnmappedBranches, getBranchMappings } from '@/lib/data'
import { ShipmentDashboard } from '@/components/shipments/shipment-dashboard'
import { BranchMappingPanel } from '@/components/shipments/branch-mapping-panel'
import { DownloadExcelButton } from '@/components/shipments/download-excel-button'

// Renders live per-request data and constructs a service-role Supabase client
// (getUnmappedBranches/getBranchMappings) with no cookies() bailout, so this
// page must never be statically prerendered at build time.
export const dynamic = 'force-dynamic'

async function ShipmentContent() {
  const [stats, carriers, unmapped, mappings] = await Promise.all([
    getBalikobotStats(),
    getCarriers(),
    getUnmappedBranches(),
    getBranchMappings(),
  ])

  return (
    <div className="space-y-5">
      <BranchMappingPanel unmapped={unmapped} mappings={mappings} carriers={carriers} />
      <ShipmentDashboard stats={stats} carriers={carriers} />
    </div>
  )
}

export default function ZasilkyPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Zásilky"
        description="Lokia WMS — počty zásilek a dobírky dle zemí"
        actions={<DownloadExcelButton />}
      />
      <div className="flex-1 overflow-y-auto p-5">
        <Suspense fallback={<div className="h-64 rounded-xl bg-gray-100 animate-pulse" />}>
          <ShipmentContent />
        </Suspense>
      </div>
    </div>
  )
}
