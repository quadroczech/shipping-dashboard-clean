-- Heal overlapping active carrier-level fuel/toll rates.
--
-- Invariant (docs/HOW-IT-WORKS.md): at most one carrier_surcharges record per (carrier, type)
-- may be active on any given day. The convention is to close the previous record
-- (valid_to = new valid_from − 1) whenever a new rate is added. When that step is
-- missed, an old open-ended record keeps overlapping the new one, and
-- getProfitabilityMatrix sums every active record — double-counting the surcharge
-- and silently corrupting every margin for that carrier.
--
-- This closes each open-ended record that is superseded by a later record of the
-- same (carrier, type), setting valid_to to the day before its earliest successor.
-- Idempotent: re-running changes nothing once the data is consistent.
UPDATE carrier_surcharges older
SET valid_to = (
      SELECT MIN(newer.valid_from) - 1
      FROM carrier_surcharges newer
      WHERE newer.carrier_id = older.carrier_id
        AND newer.type       = older.type
        AND newer.valid_from > older.valid_from
    ),
    updated_at = now()
WHERE older.valid_to IS NULL
  AND EXISTS (
      SELECT 1
      FROM carrier_surcharges newer
      WHERE newer.carrier_id = older.carrier_id
        AND newer.type       = older.type
        AND newer.valid_from > older.valid_from
  );
