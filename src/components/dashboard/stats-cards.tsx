import { Badge } from '@/components/ui/badge'
import {
  TrendingUp, TrendingDown, Globe, Truck,
  AlertTriangle, Package, Shield, ShieldAlert,
} from 'lucide-react'
import type { DashboardStats } from '@/types'
import { cn } from '@/lib/utils'

interface StatsCardsProps {
  stats: DashboardStats
}

export function StatsCards({ stats }: StatsCardsProps) {
  const marginOk = stats.avg_margin_pct >= 5
  const marginWarn = stats.avg_margin_pct >= 0 && stats.avg_margin_pct < 5
  const marginBad = stats.avg_margin_pct < 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {/* Avg margin — the hero metric */}
      <div className={cn(
        'relative rounded-xl p-4 overflow-hidden col-span-2 lg:col-span-1',
        marginOk && 'bg-gradient-to-br from-emerald-500 to-emerald-600',
        marginWarn && 'bg-gradient-to-br from-amber-500 to-amber-600',
        marginBad && 'bg-gradient-to-br from-red-500 to-red-600',
      )}>
        <div className="absolute top-2 right-2 opacity-10">
          {marginOk ? <Shield className="h-16 w-16 text-white" /> : <ShieldAlert className="h-16 w-16 text-white" />}
        </div>
        <p className="text-[11px] font-medium text-white/80 uppercase tracking-wider">Marže</p>
        <p className="text-3xl font-black text-white mt-1">{stats.avg_margin_pct.toFixed(1)}%</p>
        <p className="text-[11px] text-white/70 mt-1">
          {marginOk ? 'Zdravá marže' : marginWarn ? 'Nízká marže' : 'Záporná marže!'}
        </p>
      </div>

      {/* Negative margins */}
      <div className="rounded-xl bg-white border border-gray-100 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Ztrátové</p>
          <div className={cn(
            'h-6 w-6 rounded-md flex items-center justify-center',
            stats.negative_margin_count > 0 ? 'bg-red-50' : 'bg-green-50'
          )}>
            <TrendingDown className={cn('h-3 w-3', stats.negative_margin_count > 0 ? 'text-red-500' : 'text-green-500')} />
          </div>
        </div>
        <p className={cn(
          'text-2xl font-black mt-1.5',
          stats.negative_margin_count > 0 ? 'text-red-600' : 'text-green-600'
        )}>
          {stats.negative_margin_count}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          z {stats.positive_margin_count + stats.negative_margin_count} tras
        </p>
      </div>

      {/* Active countries */}
      <div className="rounded-xl bg-white border border-gray-100 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Země</p>
          <div className="h-6 w-6 rounded-md bg-blue-50 flex items-center justify-center">
            <Globe className="h-3 w-3 text-blue-500" />
          </div>
        </div>
        <p className="text-2xl font-black text-gray-900 mt-1.5">{stats.total_countries}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">{stats.total_carriers} dopravci</p>
      </div>

      {/* Contracts expiring */}
      <div className="rounded-xl bg-white border border-gray-100 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Smlouvy</p>
          <div className={cn(
            'h-6 w-6 rounded-md flex items-center justify-center',
            stats.contracts_expiring_soon > 0 ? 'bg-amber-50' : 'bg-gray-50'
          )}>
            <AlertTriangle className={cn('h-3 w-3', stats.contracts_expiring_soon > 0 ? 'text-amber-500' : 'text-gray-400')} />
          </div>
        </div>
        <p className={cn(
          'text-2xl font-black mt-1.5',
          stats.contracts_expiring_soon > 0 ? 'text-amber-600' : 'text-gray-400'
        )}>
          {stats.contracts_expiring_soon}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">vyprší do 90 dnů</p>
      </div>

      {/* Monthly shipments */}
      <div className="rounded-xl bg-white border border-gray-100 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Zásilky</p>
          <div className="h-6 w-6 rounded-md bg-purple-50 flex items-center justify-center">
            <Package className="h-3 w-3 text-purple-500" />
          </div>
        </div>
        <p className="text-2xl font-black text-gray-900 mt-1.5">
          {stats.total_monthly_shipments != null ? stats.total_monthly_shipments.toLocaleString('cs-CZ') : '—'}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">tento měsíc</p>
      </div>
    </div>
  )
}
