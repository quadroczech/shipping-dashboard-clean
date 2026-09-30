-- Add price and currency_code to lokia_document_detail_cache
ALTER TABLE lokia_document_detail_cache
  ADD COLUMN IF NOT EXISTS price         NUMERIC,
  ADD COLUMN IF NOT EXISTS currency_code TEXT;

-- Add avg_shipping_price to balikobot_stats
ALTER TABLE balikobot_stats
  ADD COLUMN IF NOT EXISTS avg_shipping_price NUMERIC,
  ADD COLUMN IF NOT EXISTS shipping_currency  TEXT;
