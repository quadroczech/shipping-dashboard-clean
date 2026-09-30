-- PACKETA catch-all (service_type IS NULL) for CZ, SK, HU → pickup
-- Covers Lokia docs where CarrierCode=zasilkovna but ServiceType is missing/null.
INSERT INTO lokia_service_map
  (lokia_carrier_code, lokia_service_type, country_code, carrier_code, delivery_type, last_mile_carrier)
VALUES
  ('zasilkovna', NULL, 'CZ', 'PACKETA', 'pickup', NULL),
  ('zasilkovna', NULL, 'SK', 'PACKETA', 'pickup', NULL),
  ('zasilkovna', NULL, 'HU', 'PACKETA', 'pickup', 'Foxpost')
ON CONFLICT (lokia_carrier_code, lokia_service_type, country_code) DO NOTHING;
