// ─── Countries & Carriers ────────────────────────────────────────────────────

export type Currency = 'CZK' | 'EUR' | 'HUF' | 'RON' | 'PLN' | 'CHF' | 'GBP' | 'DKK' | 'SEK'

export interface Country {
  id: string
  code: string          // CZ, SK, HU, RO, DE, AT, BE, NL, PL, FR, CH, IT, COM
  name: string
  eshop_url: string
  currency: Currency
  flag: string
  vat_rate: number
  created_at: string
}

export interface Carrier {
  id: string
  code: string          // PPL, GLS, PACKETA, CESKA_POSTA, SLOVENSKA_POSTA
  name: string
  logo_color: string
  website_url: string | null
  fuel_surcharge_url: string | null
  sales_rep_name: string | null
  sales_rep_email: string | null
  sales_rep_phone: string | null
  created_at: string
}

export interface CountryCarrier {
  id: string
  country_id: string
  carrier_id: string
  is_active: boolean
  contract_start: string | null
  contract_end: string | null
  contract_notes: string | null
  country?: Country
  carrier?: Carrier
}

// ─── Prices ──────────────────────────────────────────────────────────────────

export interface CarrierBasePrice {
  id: string
  country_carrier_id: string
  weight_from: number   // kg
  weight_to: number     // kg
  base_price: number
  currency: Currency
  delivery_type: string | null   // null = applies to all, 'home' or 'pickup'
  service_name: string | null    // null = applies to all services; otherwise scoped to that service_name
  surcharges_included: boolean   // true = price already includes all surcharges
  valid_from: string
  valid_to: string | null
  notes: string | null
  country_carrier?: CountryCarrier
}

export type DeliveryType = 'home' | 'pickup'

export interface CustomerPrice {
  id: string
  country_carrier_id: string
  price: number
  currency: Currency
  free_shipping_threshold: number | null
  delivery_type: DeliveryType
  service_name: string | null
  valid_from: string
  valid_to: string | null
  notes: string | null
  country_carrier?: CountryCarrier
}

export interface ReturnPrice {
  id: string
  country_carrier_id: string
  price: number
  currency: Currency
  valid_from: string
  valid_to: string | null
  notes: string | null
  country_carrier?: CountryCarrier
}

// ─── Surcharges ───────────────────────────────────────────────────────────────

export type SurchargeType =
  | 'fuel'
  | 'toll'
  | 'cod'
  | 'cod_card'
  | 'address_delivery'
  | 'remote_area'
  | 'oversize'
  | 'other'

// Carrier-level surcharges: fuel and toll apply uniformly to all routes of a carrier
export interface CarrierSurcharge {
  id: string
  carrier_id: string
  type: 'fuel' | 'toll'
  value: number
  is_percentage: boolean
  is_per_kg: boolean
  valid_from: string
  valid_to: string | null
  source_url: string | null
  carrier?: Carrier
}

// Per-route surcharges: COD, address_delivery, remote_area, oversize, other
export interface Surcharge {
  id: string
  country_carrier_id: string
  type: SurchargeType
  label: string | null
  value: number
  is_percentage: boolean
  is_per_kg: boolean
  currency: Currency | null
  valid_from: string
  valid_to: string | null
  source_url: string | null
  auto_updated: boolean
  country_carrier?: CountryCarrier
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'pending' | 'processing' | 'parsed' | 'reviewed' | 'approved'

export interface Invoice {
  id: string
  country_carrier_id: string
  invoice_number: string
  invoice_date: string
  period_month: string      // YYYY-MM
  total_amount: number
  currency: Currency
  shipment_count: number | null
  contracted_total: number | null   // expected total based on contracted prices
  variance_amount: number | null    // actual - contracted
  variance_pct: number | null
  file_url: string | null
  status: InvoiceStatus
  notes: string | null
  parsed_data: Record<string, unknown> | null
  created_at: string
  country_carrier?: CountryCarrier
}

// ─── Balíkobot ───────────────────────────────────────────────────────────────

export interface BalikobotShipmentStats {
  id: string
  country_id: string
  carrier_id: string
  month: string             // YYYY-MM
  service_type: string | null
  delivery_type: 'home' | 'pickup' | null
  last_mile_carrier: string | null
  shipment_count: number
  return_count: number | null
  cod_count: number | null
  avg_weight: number | null
  avg_shipping_price: number | null
  shipping_currency: string | null
  synced_at: string
  country?: Country
  carrier?: Carrier
}

// Maps a Lokia PackageInformation.BranchId (Packeta routing id) to our carrier,
// so consolidated Packeta shipments split into their real last-mile carrier.
export interface LokiaBranchMap {
  id: string
  lokia_carrier_code: string
  country_code: string | null
  branch_id: string
  is_prefix: boolean
  carrier_code: string
  delivery_type: 'home' | 'pickup' | null
  last_mile_carrier: string | null
  note: string | null
  created_at: string
}

// A BranchId seen in the Lokia cache that has no lokia_branch_map entry yet.
export interface UnmappedBranch {
  country_code: string
  branch_id: string
  doc_count: number
}

// ─── Exchange Rates ───────────────────────────────────────────────────────────

export interface ExchangeRate {
  id: string
  from_currency: Currency
  to_currency: Currency     // always CZK for normalization
  rate: number
  date: string
}

// ─── Dashboard / Computed ─────────────────────────────────────────────────────

export interface ProfitabilityRow {
  country: Country
  carrier: Carrier
  country_carrier_id: string
  service_name: string | null
  delivery_type: DeliveryType | null
  customer_price: number
  customer_price_czk: number
  free_shipping_threshold: number | null
  carrier_base_price: number
  carrier_base_price_czk: number
  surcharges_total: number
  surcharges_total_czk: number
  surcharges_breakdown: SurchargeBreakdown[]
  total_carrier_cost: number
  total_carrier_cost_czk: number
  customer_price_net: number      // customer_price / (1 + vat_rate) - comparable to carrier cost
  customer_price_net_czk: number
  margin: number            // customer_price_net - total_carrier_cost (in local currency)
  margin_czk: number
  margin_pct: number        // margin / customer_price_net * 100
  currency: Currency
  return_price: number | null
  return_price_czk: number | null
  contract_end: string | null
}

export interface SurchargeBreakdown {
  type: SurchargeType
  label: string
  value: number
  is_percentage: boolean
  currency: Currency | null
  computed_amount: number   // always in local currency
}

export interface DashboardStats {
  total_countries: number
  total_carriers: number
  avg_margin_pct: number
  positive_margin_count: number
  negative_margin_count: number
  contracts_expiring_soon: number   // within 90 days
  total_monthly_shipments: number | null
}
