-- RPC function: aggregate lokia_document_detail_cache by carrier, country, and weight band.
-- Weight bands: ≤2kg, 2-5kg, 5-10kg, 10-20kg, >20kg
-- NULL weight is treated as ≤2kg (per business rule).

CREATE OR REPLACE FUNCTION get_shipments_by_weight_band()
RETURNS TABLE (
  carrier_code text,
  country_code text,
  band_2kg     bigint,
  band_5kg     bigint,
  band_10kg    bigint,
  band_20kg    bigint,
  band_31kg    bigint
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    carrier_code,
    country_code,
    COUNT(*) FILTER (WHERE weight IS NULL OR weight <= 2)         AS band_2kg,
    COUNT(*) FILTER (WHERE weight > 2  AND weight <= 5)           AS band_5kg,
    COUNT(*) FILTER (WHERE weight > 5  AND weight <= 10)          AS band_10kg,
    COUNT(*) FILTER (WHERE weight > 10 AND weight <= 20)          AS band_20kg,
    COUNT(*) FILTER (WHERE weight > 20)                           AS band_31kg
  FROM lokia_document_detail_cache
  WHERE carrier_code IS NOT NULL
    AND country_code IS NOT NULL
  GROUP BY carrier_code, country_code
  ORDER BY carrier_code, country_code;
$$;
