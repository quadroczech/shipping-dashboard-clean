-- New table: carrier-level fuel/toll surcharges (instead of per-country_carrier)
CREATE TABLE carrier_surcharges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id  uuid NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('fuel', 'toll')),
  value       numeric(10,4) NOT NULL,
  is_percentage boolean NOT NULL DEFAULT true,
  is_per_kg   boolean NOT NULL DEFAULT false,
  valid_from  date NOT NULL,
  valid_to    date,
  source_url  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX ON carrier_surcharges (carrier_id, type, valid_from);

-- Migrate existing fuel/toll surcharges — deduplicate to one per (carrier, type, valid_from)
INSERT INTO carrier_surcharges (carrier_id, type, value, is_percentage, is_per_kg, valid_from, valid_to, source_url)
SELECT DISTINCT ON (cc.carrier_id, s.type, s.valid_from)
  cc.carrier_id,
  s.type,
  s.value,
  s.is_percentage,
  s.is_per_kg,
  s.valid_from,
  s.valid_to,
  s.source_url
FROM surcharges s
JOIN country_carriers cc ON cc.id = s.country_carrier_id
WHERE s.type IN ('fuel', 'toll')
ORDER BY cc.carrier_id, s.type, s.valid_from, s.value DESC;

-- Remove fuel/toll from the per-route surcharges table
DELETE FROM surcharges WHERE type IN ('fuel', 'toll');
