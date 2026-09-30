'use client'

import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MobileNav } from '@/components/layout/sidebar'

interface HeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  badge?: React.ReactNode
}

export function Header({ title, description, actions, badge }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-100 bg-white/80 backdrop-blur-sm px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <MobileNav />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-bold text-gray-900 tracking-tight">{title}</h1>
            {badge}
          </div>
          {description && <p className="hidden truncate text-[11px] text-gray-400 -mt-0.5 sm:block">{description}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
      </div>
    </header>
  )
}

export function RefreshButton({ onClick, loading }: { onClick?: () => void; loading?: boolean }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={loading} className="h-7 text-xs gap-1.5 px-2.5">
      <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
      Aktualizovat
    </Button>
  )
}
