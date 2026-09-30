import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ProfitabilityRow } from '@/types'
import { formatCurrency } from '@/lib/constants'
import { AlertCircle, ArrowDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TopLossesProps {
  data: ProfitabilityRow[]
}

export function TopLosses({ data }: TopLossesProps) {
  const sorted = [...data]
    .sort((a, b) => a.margin_czk - b.margin_czk)
    .slice(0, 5)

  const hasLosses = sorted.some((r) => r.margin_pct < 0)

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-1.5 pt-3.5 px-4">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">
          {hasLosses ? (
            <div className="h-5 w-5 rounded-md bg-red-50 flex items-center justify-center">
              <AlertCircle className="h-3 w-3 text-red-500" />
            </div>
          ) : (
            <div className="h-5 w-5 rounded-md bg-gray-50 flex items-center justify-center">
              <ArrowDownRight className="h-3 w-3 text-gray-400" />
            </div>
          )}
          {hasLosses ? 'Vyžaduje pozornost' : 'Nejnižší marže'}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3.5">
        <div className="space-y-1">
          {sorted.map((row, i) => {
            const isNegative = row.margin_pct < 0
            const isLow = row.margin_pct >= 0 && row.margin_pct < 5
            return (
              <div
                key={row.country_carrier_id}
                className={cn(
                  'flex items-center justify-between rounded-lg px-2.5 py-2 transition-colors',
                  isNegative ? 'bg-red-50/60' : isLow ? 'bg-amber-50/40' : 'hover:bg-gray-50'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold text-gray-300 w-3.5 shrink-0">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-800 truncate">
                      {row.country.code}
                      <span className="text-gray-400 font-normal mx-1">/</span>
                      {row.carrier.code}
                    </div>
                    {row.service_name && (
                      <div className="text-[9px] text-gray-400 truncate">{row.service_name}</div>
                    )}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] font-bold px-1.5 py-0 h-5 shrink-0 ml-2',
                    isNegative
                      ? 'bg-red-100 text-red-700 border-red-200'
                      : isLow
                      ? 'bg-amber-100 text-amber-700 border-amber-200'
                      : 'bg-green-50 text-green-700 border-green-200'
                  )}
                >
                  {row.margin_pct.toFixed(1)}%
                </Badge>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
