'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RefreshCw } from 'lucide-react'
import type { Currency } from '@/types'

const CURRENCY_NAMES: Record<string, string> = {
  EUR: 'Euro',
  CHF: 'Švýcarský frank',
  GBP: 'Britská libra',
  HUF: 'Maďarský forint',
  PLN: 'Polský zlotý',
  RON: 'Rumunský leu',
  DKK: 'Dánská koruna',
  SEK: 'Švédská koruna',
}

interface Props {
  rates: Record<Currency, number>
}

export function ExchangeRateSync({ rates }: Props) {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleSync() {
    setSyncing(true)
    setResult(null)
    try {
      const res = await fetch('/api/cron/exchange-rates')
      const data = await res.json()
      if (data.ok) {
        setResult(`Aktualizováno ${data.rates_updated} kurzů pro ${data.date}`)
        setTimeout(() => window.location.reload(), 1500)
      } else {
        setResult(data.error ?? 'Chyba')
      }
    } catch {
      setResult('Chyba připojení')
    } finally {
      setSyncing(false)
    }
  }

  const displayCurrencies = Object.entries(rates).filter(([code]) => code !== 'CZK')

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Kurzovní lístek (ČNB)</CardTitle>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Aktualizuji...' : 'Aktualizovat'}
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 text-xs">
        {displayCurrencies.map(([code, rate]) => (
          <div key={code} className="flex items-center justify-between py-0.5">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{code}</Badge>
              <span className="text-gray-500">{CURRENCY_NAMES[code] ?? code}</span>
            </div>
            <span className="font-mono text-gray-700">{rate.toFixed(3)} CZK</span>
          </div>
        ))}
        {result && (
          <p className={`text-xs font-medium pt-1 ${result.includes('Chyba') ? 'text-red-600' : 'text-green-600'}`}>
            {result}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
