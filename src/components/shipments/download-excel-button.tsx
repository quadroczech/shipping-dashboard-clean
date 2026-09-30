'use client'

import { Button } from '@/components/ui/button'
import { FileDown } from 'lucide-react'

export function DownloadExcelButton() {
  return (
    <a href="/api/export/shipments-excel" download>
      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 px-2.5">
        <FileDown className="h-3 w-3" />
        Export zásilek dle váhy
      </Button>
    </a>
  )
}
