-- Add service_type to lokia_document_detail_cache
ALTER TABLE lokia_document_detail_cache
  ADD COLUMN IF NOT EXISTS service_type TEXT;

-- Add service_type to balikobot_stats
ALTER TABLE balikobot_stats
  ADD COLUMN IF NOT EXISTS service_type TEXT;

-- Replace old unique constraint with functional one that includes service_type
-- (COALESCE so NULL service_type rows don't bypass uniqueness)
ALTER TABLE balikobot_stats
  DROP CONSTRAINT IF EXISTS balikobot_stats_country_id_carrier_id_month_key;

CREATE UNIQUE INDEX IF NOT EXISTS balikobot_stats_unique_key
  ON balikobot_stats (country_id, carrier_id, month, COALESCE(service_type, ''));
