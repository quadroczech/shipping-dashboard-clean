'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Globe,
  TruckIcon,
  FileText,
  Package,
  BarChart3,
  Settings,
  ChevronRight,
  Zap,
  Store,
  Calculator,
  Menu,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  {
    label: 'Přehled',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Klíčové metriky',
  },
  {
    label: 'Ceník',
    href: '/cenik',
    icon: Globe,
    description: 'Zákaznické ceny',
  },
  {
    label: 'Kalkulačka',
    href: '/kalkulacka',
    icon: Calculator,
    description: 'Simulace marží',
  },
  {
    label: 'Dopravci',
    href: '/dopravci',
    icon: TruckIcon,
    description: 'Smlouvy & sazby',
  },
  {
    label: 'Faktury',
    href: '/faktury',
    icon: FileText,
    description: 'Controlling',
  },
  {
    label: 'Zásilky',
    href: '/zasilky',
    icon: Package,
    description: 'Lokia WMS',
  },
  {
    label: 'Analýzy',
    href: '/analyzy',
    icon: BarChart3,
    description: 'Trendy & srovnání',
  },
  {
    label: 'Příplatky',
    href: '/priplatky',
    icon: Zap,
    description: 'Palivové & ostatní',
  },
  {
    label: 'Průzkum trhu',
    href: '/trh',
    icon: Store,
    description: 'Srovnání s konkurencí',
  },
]

/** Shared sidebar content used by both the desktop rail and the mobile drawer. */
function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <>
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-gray-100 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 shadow-sm">
          <Zap className="h-3.5 w-3.5 text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-[13px] font-bold text-gray-900 tracking-tight">Shipping Hub</p>
          <p className="text-[10px] text-gray-400 font-medium">Přehled dopravy</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all duration-150',
                  isActive
                    ? 'bg-blue-50/80 text-blue-700 font-semibold shadow-sm shadow-blue-100/50'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                )}
              >
                <div className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100/80 text-gray-400 group-hover:bg-gray-200/80 group-hover:text-gray-600'
                )}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block truncate">{item.label}</span>
                  {isActive && (
                    <span className="block text-[9px] font-normal text-blue-500/70 -mt-0.5">{item.description}</span>
                  )}
                </div>
                {isActive && <ChevronRight className="h-3 w-3 text-blue-400 shrink-0" />}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Bottom */}
      <div className="border-t border-gray-100 p-2.5">
        <Link
          href="/nastaveni"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all duration-150',
            pathname === '/nastaveni'
              ? 'bg-gray-100 text-gray-800 font-medium'
              : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
          )}
        >
          <div className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md',
            pathname === '/nastaveni' ? 'bg-gray-200 text-gray-600' : 'bg-gray-100/50 text-gray-400'
          )}>
            <Settings className="h-3.5 w-3.5" />
          </div>
          <span>Nastavení</span>
        </Link>
      </div>
    </>
  )
}

/** Desktop sidebar rail — hidden below the lg breakpoint (see MobileNav). */
export function Sidebar() {
  return (
    <aside className="hidden lg:flex h-screen w-[220px] flex-col border-r border-gray-200/80 bg-white">
      <SidebarBody />
    </aside>
  )
}

/**
 * Mobile navigation: a hamburger button (shown below lg) that opens a slide-in
 * drawer with the same navigation. Lives in the Header so it sits in the top bar.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false)

  // Lock body scroll and close on Escape while the drawer is open.
  // (Tapping a nav link closes the drawer via SidebarBody's onNavigate.)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Otevřít menu"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/*
        The drawer is rendered through a portal to <body>. The header has
        `backdrop-blur`, which makes it the containing block for fixed-position
        descendants — so a fixed overlay nested in the header would collapse to
        the header's height. Portalling to <body> escapes that trap.
      */}
      {open && createPortal(
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[15rem] max-w-[82%] flex-col border-r border-gray-200/80 bg-white shadow-2xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Zavřít menu"
              className="absolute right-2 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </aside>
        </div>,
        document.body,
      )}
    </>
  )
}
