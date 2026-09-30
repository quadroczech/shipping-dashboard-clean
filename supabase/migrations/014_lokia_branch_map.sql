-- 014: Lokia BranchId capture + branch→carrier mapping
--
-- Lokia's PackageInformation.BranchId is the only field that distinguishes
-- the real last-mile carrier for consolidated Packeta ("zasilkovna") shipments
-- (e.g. RO: BranchId 762 = FAN Courier home, 7455-* = Sameday easybox).
-- We capture BranchId in the cache and map it to a carrier + delivery_type +
-- last_mile label so these sub-carriers split out into balikobot_stats / zasilky.

ALTER TABLE lokia_document_detail_cache ADD COLUMN IF NOT EXISTS branch_id text;
CREATE INDEX IF NOT EXISTS idx_lokia_cache_branch
  ON lokia_document_detail_cache (carrier_code, branch_id);

CREATE TABLE IF NOT EXISTS lokia_branch_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text,                 -- NULL = applies to all countries
  branch_id text NOT NULL,           -- exact value, or prefix when is_prefix = true
  is_prefix boolean NOT NULL DEFAULT false,
  carrier_code text NOT NULL,        -- target carriers.code
  delivery_type text,                -- 'home' | 'pickup' | NULL
  last_mile_carrier text,            -- display label, e.g. 'Sameday'
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lokia_branch_map_key
  ON lokia_branch_map (COALESCE(country_code, ''), branch_id, is_prefix);

-- All access goes through the service-role (admin) client server-side.
ALTER TABLE lokia_branch_map ENABLE ROW LEVEL SECURITY;

-- Seed RO Packeta sub-carriers discovered from live Lokia BranchId data.
INSERT INTO lokia_branch_map (country_code, branch_id, is_prefix, carrier_code, delivery_type, last_mile_carrier, note)
VALUES
  ('RO', '762',   false, 'PACKETA', 'home',   'FANcourier', 'Packeta RO home delivery via FAN Courier'),
  ('RO', '7455-', true,  'PACKETA', 'pickup', 'Sameday',    'Packeta RO Sameday easybox lockers')
ON CONFLICT DO NOTHING;

-- Widen balikobot_stats uniqueness to include last_mile_carrier, so multiple
-- sub-carriers under the same carrier + delivery_type can coexist as rows.
DROP INDEX IF EXISTS balikobot_stats_unique_key;
CREATE UNIQUE INDEX balikobot_stats_unique_key
  ON balikobot_stats (country_id, carrier_id, month,
    COALESCE(service_type, ''), COALESCE(delivery_type, ''), COALESCE(last_mile_carrier, ''));
