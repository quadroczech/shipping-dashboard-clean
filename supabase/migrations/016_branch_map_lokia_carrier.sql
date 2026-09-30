-- 016: scope lokia_branch_map to the raw Lokia carrier code.
-- BranchId values are only meaningful per Lokia carrier — Packeta ("zasilkovna")
-- and PPL/GLS depots can reuse the same numbers — so a mapping must match the
-- raw carrier too, not just (country, branch_id).
ALTER TABLE lokia_branch_map
  ADD COLUMN IF NOT EXISTS lokia_carrier_code text NOT NULL DEFAULT 'zasilkovna';

DROP INDEX IF EXISTS lokia_branch_map_key;
CREATE UNIQUE INDEX lokia_branch_map_key
  ON lokia_branch_map (lokia_carrier_code, COALESCE(country_code, ''), branch_id, is_prefix);
