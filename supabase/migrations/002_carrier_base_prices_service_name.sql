-- Adds per-service base prices so that multiple customer_prices sharing the
-- same (country_carrier_id, delivery_type) but different service_name can each
-- have their own carrier base price. Previously the base price was shared,
-- causing edits to one service (e.g. FAN Box) to mutate the other
-- (e.g. Packeta.ro) in the same country/carrier/delivery_type.
ALTER TABLE carrier_base_prices ADD COLUMN IF NOT EXISTS service_name TEXT;
CREATE INDEX IF NOT EXISTS idx_carrier_base_prices_cc_dt_service
  ON carrier_base_prices (country_carrier_id, delivery_type, service_name);
