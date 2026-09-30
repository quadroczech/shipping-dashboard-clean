import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ExchangeRateSync } from '@/components/settings/exchange-rate-sync'
import { getExchangeRates } from '@/lib/data'
import { Suspense } from 'react'

async function ExchangeRateSection() {
  const rates = await getExchangeRates()
  return <ExchangeRateSync rates={rates} />
}

export default function NastaveniPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Nastavení" description="Integrace, kurzy, automatické úlohy" />
      <div className="flex-1 overflow-y-auto p-5">
        <div className="space-y-3 max-w-lg">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-1.5 pt-3.5 px-4">
              <CardTitle className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Integrace</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs px-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-700">Lokia WMS API</p>
                  <p className="text-[10px] text-gray-400">OAuth2 · přihlášení z .env</p>
                </div>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] font-bold h-5 px-1.5">Aktivní</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-700">Supabase</p>
                  <p className="text-[10px] text-gray-400">PostgreSQL</p>
                </div>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] font-bold h-5 px-1.5">Aktivní</Badge>
              </div>
            </CardContent>
          </Card>

          <Suspense fallback={<div className="h-32 rounded-xl bg-gray-100 animate-pulse" />}>
            <ExchangeRateSection />
          </Suspense>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-1.5 pt-3.5 px-4">
              <CardTitle className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Automatické úlohy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-gray-600 px-4 pb-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">Kurzy ČNB</span>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-bold h-5 px-1.5">Po-Pá 15:00</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Sync Lokia WMS</span>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-bold h-5 px-1.5">Po-Pá 18:00</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
