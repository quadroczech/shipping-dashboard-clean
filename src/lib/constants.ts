import type { Currency, SurchargeType } from '@/types'

// ─── Surcharge labels ─────────────────────────────────────────────────────────

export const SURCHARGE_TYPE_LABELS: Record<SurchargeType, string> = {
  fuel: 'Palivový příplatek',
  toll: 'Mýtný příplatek',
  cod: 'Dobírka (hotovost)',
  cod_card: 'Dobírka (karta)',
  address_delivery: 'Příplatek za doručení na adresu',
  remote_area: 'Vzdálená oblast',
  oversize: 'Nadrozměrná zásilka',
  other: 'Ostatní',
}

// ─── Countries ────────────────────────────────────────────────────────────────

export const COUNTRIES_SEED = [
  { code: 'CZ', name: 'Česká republika', eshop_url: 'www.example-shop.cz',  currency: 'CZK', flag: '🇨🇿' },
  { code: 'SK', name: 'Slovensko',        eshop_url: 'www.example-shop.sk',  currency: 'EUR', flag: '🇸🇰' },
  { code: 'HU', name: 'Maďarsko',         eshop_url: 'www.example-shop.hu',  currency: 'HUF', flag: '🇭🇺' },
  { code: 'RO', name: 'Rumunsko',         eshop_url: 'www.example-shop.ro',  currency: 'RON', flag: '🇷🇴' },
  { code: 'DE', name: 'Německo',          eshop_url: 'www.example-shop.de',  currency: 'EUR', flag: '🇩🇪' },
  { code: 'AT', name: 'Rakousko',         eshop_url: 'www.example-shop.at',  currency: 'EUR', flag: '🇦🇹' },
  { code: 'BE', name: 'Belgie',           eshop_url: 'www.example-shop.be',  currency: 'EUR', flag: '🇧🇪' },
  { code: 'NL', name: 'Nizozemsko',       eshop_url: 'www.example-shop.nl',  currency: 'EUR', flag: '🇳🇱' },
  { code: 'COM', name: 'Mezinárodní',     eshop_url: 'www.example-shop.com', currency: 'EUR', flag: '🌍' },
  { code: 'PL', name: 'Polsko',           eshop_url: 'www.example-shop.pl',  currency: 'PLN', flag: '🇵🇱' },
  { code: 'FR', name: 'Francie',          eshop_url: 'www.example-shop.fr',  currency: 'EUR', flag: '🇫🇷' },
  { code: 'CH', name: 'Švýcarsko',        eshop_url: 'www.example-shop.ch',  currency: 'CHF', flag: '🇨🇭' },
  { code: 'IT', name: 'Itálie',           eshop_url: 'www.example-shop.it',  currency: 'EUR', flag: '🇮🇹' },
  { code: 'DK', name: 'Dánsko',           eshop_url: 'www.example-shop.dk',  currency: 'DKK', flag: '🇩🇰' },
  { code: 'SE', name: 'Švédsko',          eshop_url: 'www.example-shop.se',  currency: 'SEK', flag: '🇸🇪' },
] as const

// ─── Carriers ─────────────────────────────────────────────────────────────────

export const CARRIERS_SEED = [
  {
    code: 'PPL',
    name: 'PPL',
    logo_color: '#E30613',
    website_url: 'https://www.ppl.cz',
    fuel_surcharge_url: 'https://www.ppl.cz/priplatky',
  },
  {
    code: 'GLS',
    name: 'GLS',
    logo_color: '#009900',
    website_url: 'https://gls-group.com',
    fuel_surcharge_url: 'https://gls-group.com/CZ/cs/surcharges.html',
  },
  {
    code: 'PACKETA',
    name: 'Zásilkovna / Packeta',
    logo_color: '#BA2228',
    website_url: 'https://www.packeta.com',
    fuel_surcharge_url: null,
  },
  {
    code: 'SLOVENSKA_POSTA',
    name: 'Slovenská pošta',
    logo_color: '#F7941D',
    website_url: 'https://www.posta.sk',
    fuel_surcharge_url: 'https://www.posta.sk/files/6837ffcf2117f774bfbf4328/palivovy-priplatok-pre-zmluvneho-zakaznika.pdf',
  },
] as const

// ─── Country–Carrier mapping ──────────────────────────────────────────────────

export const COUNTRY_CARRIERS: Record<string, string[]> = {
  CZ:  ['PPL', 'GLS', 'PACKETA'],
  SK:  ['PPL', 'GLS', 'PACKETA', 'SLOVENSKA_POSTA'],
  HU:  ['PPL', 'GLS', 'PACKETA'],
  RO:  ['PPL', 'GLS', 'PACKETA'],
  DE:  ['PPL', 'GLS'],
  AT:  ['PPL', 'GLS'],
  BE:  ['PPL', 'GLS', 'PACKETA'],
  NL:  ['PPL', 'GLS'],
  COM: ['GLS'],
  PL:  ['PPL', 'GLS'],
  FR:  ['PPL', 'GLS', 'PACKETA'],
  CH:  ['PACKETA'],
  IT:  ['PPL', 'GLS', 'PACKETA'],
  DK:  [],
  SE:  [],
}

// ─── Currency helpers ─────────────────────────────────────────────────────────

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  CZK: 'Kč',
  EUR: '€',
  HUF: 'Ft',
  RON: 'lei',
  PLN: 'zł',
  CHF: 'CHF',
  GBP: '£',
  DKK: 'kr',
  SEK: 'kr',
}

// Approximate exchange rates to CZK (updated manually or via API)
export const DEFAULT_EXCHANGE_RATES: Record<Currency, number> = {
  CZK: 1,
  EUR: 25.2,
  HUF: 0.065,
  RON: 5.07,
  PLN: 5.9,
  CHF: 28.1,
  GBP: 31.5,
  DKK: 3.38,
  SEK: 2.23,
}

export function formatCurrency(amount: number, currency: Currency): string {
  const symbol = CURRENCY_SYMBOLS[currency]
  const formatted = amount.toLocaleString('cs-CZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (currency === 'CZK') return `${formatted} ${symbol}`
  return `${symbol} ${formatted}`
}

export function toCZK(amount: number, currency: Currency, rates?: Partial<Record<Currency, number>>): number {
  const r = rates ?? DEFAULT_EXCHANGE_RATES
  return amount * (r[currency] ?? DEFAULT_EXCHANGE_RATES[currency])
}
