ALTER TABLE balikobot_stats
  ADD COLUMN IF NOT EXISTS delivery_type     TEXT CHECK (delivery_type IN ('home', 'pickup')),
  ADD COLUMN IF NOT EXISTS last_mile_carrier TEXT;

-- Update unique index to include delivery_type (home vs pickup can coexist for same carrier/month)
DROP INDEX IF EXISTS balikobot_stats_unique_key;
CREATE UNIQUE INDEX balikobot_stats_unique_key
  ON balikobot_stats (country_id, carrier_id, month, COALESCE(service_type, ''), COALESCE(delivery_type, ''));
