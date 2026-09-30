-- ── New carriers ────────────────────────────────────────────────────────────
INSERT INTO carriers (code, name, logo_color, website_url) VALUES
  ('CESKA_POSTA', 'Česká pošta / Balíkovna', '#FFD600', 'https://www.ceskaposta.cz')
ON CONFLICT (code) DO NOTHING;

INSERT INTO carriers (code, name, logo_color, website_url) VALUES
  ('DPD', 'DPD', '#DC0032', 'https://www.dpd.com')
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE v_country UUID; v_carrier UUID;
BEGIN
  SELECT id INTO v_carrier FROM carriers WHERE code = 'CESKA_POSTA';
  SELECT id INTO v_country FROM countries WHERE code = 'CZ';
  INSERT INTO country_carriers (country_id, carrier_id) VALUES (v_country, v_carrier) ON CONFLICT DO NOTHING;

  SELECT id INTO v_carrier FROM carriers WHERE code = 'DPD';
  SELECT id INTO v_country FROM countries WHERE code = 'CH';
  INSERT INTO country_carriers (country_id, carrier_id) VALUES (v_country, v_carrier) ON CONFLICT DO NOTHING;
END $$;

-- ── lokia_service_map ────────────────────────────────────────────────────────
-- Maps Lokia (carrier_code, service_type, country_code) → internal carrier + delivery type.
-- Lookup priority: exact (carrier+service+country) → (carrier+service, any country)
CREATE TABLE IF NOT EXISTS lokia_service_map (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lokia_carrier_code  TEXT NOT NULL,
  lokia_service_type  TEXT,                    -- NULL = any service type
  country_code        TEXT,                    -- NULL = any country
  carrier_code        TEXT NOT NULL,           -- our carriers.code
  delivery_type       TEXT NOT NULL CHECK (delivery_type IN ('home', 'pickup')),
  last_mile_carrier   TEXT,                    -- informational, e.g. 'Foxpost'
  UNIQUE (lokia_carrier_code, lokia_service_type, country_code)
);

GRANT SELECT ON lokia_service_map TO anon;
GRANT SELECT ON lokia_service_map TO authenticated;

-- ── Seed ─────────────────────────────────────────────────────────────────────
INSERT INTO lokia_service_map (lokia_carrier_code, lokia_service_type, country_code, carrier_code, delivery_type, last_mile_carrier) VALUES
  -- CZ
  ('cp',         'NB',   'CZ', 'CESKA_POSTA',    'pickup', NULL),
  ('cp',         'DR',   'CZ', 'CESKA_POSTA',    'home',   NULL),
  ('gls',        '1',    'CZ', 'GLS',             'home',   NULL),
  ('gls',        '2',    'CZ', 'GLS',             'pickup', NULL),
  ('ppl',        '4',    'CZ', 'PPL',             'home',   NULL),
  ('ppl',        '46',   'CZ', 'PPL',             'pickup', NULL),
  ('zasilkovna', 'VMCZ', 'CZ', 'PACKETA',         'pickup', NULL),
  -- SK
  ('gls',        '1',    'SK', 'GLS',             'home',   NULL),
  ('ppl',        '2',    'SK', 'PPL',             'home',   NULL),
  ('ppl',        '48',   'SK', 'PPL',             'pickup', 'Balíkovo'),
  ('sp',         'EXA',  'SK', 'SLOVENSKA_POSTA', 'home',   NULL),
  ('sp',         'EXB',  'SK', 'SLOVENSKA_POSTA', 'pickup', NULL),
  ('sp',         'EXP',  'SK', 'SLOVENSKA_POSTA', 'pickup', NULL),
  ('zasilkovna', 'VMSK', 'SK', 'PACKETA',         'pickup', NULL),
  -- HU
  ('gls',        '1',    'HU', 'GLS',             'home',   NULL),
  ('ppl',        '2',    'HU', 'PPL',             'home',   'Magyarpost'),
  ('zasilkovna', 'VMHU', 'HU', 'PACKETA',         'pickup', 'Foxpost'),
  -- RO
  ('gls',        '1',    'RO', 'GLS',             'home',   NULL),
  ('ppl',        '2',    'RO', 'PPL',             'home',   'Cargus'),
  ('zasilkovna', 'VMRO', 'RO', 'PACKETA',         'pickup', 'Packeta.ro'),
  ('zasilkovna', NULL,   'RO', 'PACKETA',         'home',   'FANcourier'),
  -- DE
  ('dhlparcel',  '1',    'DE', 'PPL',             'home',   'DHL'),
  ('gls',        '1',    'DE', 'GLS',             'home',   NULL),
  ('ppl',        '2',    'DE', 'PPL',             'pickup', 'DHL Packstation'),
  -- NL
  ('dhlparcel',  '1',    'NL', 'PPL',             'home',   'DHL'),
  ('gls',        '1',    'NL', 'GLS',             'home',   NULL),
  -- AT
  ('gls',        '1',    'AT', 'GLS',             'home',   NULL),
  ('ppl',        '2',    'AT', 'PPL',             'home',   'Österreichische Post'),
  -- BE
  ('dhlparcel',  '1',    'BE', 'PPL',             'home',   'Bpost'),
  ('gls',        '1',    'BE', 'GLS',             'home',   NULL),
  -- FR
  ('dhlparcel',  '1',    'FR', 'PPL',             'home',   'Colis privé'),
  ('gls',        '1',    'FR', 'GLS',             'home',   NULL),
  ('zasilkovna', NULL,   'FR', 'PACKETA',         'pickup', 'MondialRelay'),
  -- IT
  ('gls',        '1',    'IT', 'GLS',             'home',   NULL),
  ('zasilkovna', NULL,   'IT', 'PACKETA',         'home',   'BRT Spedizione Standard'),
  ('zasilkovna', '9104', 'IT', 'PACKETA',         'pickup', 'BRT Punto di Ritiro'),
  -- PL
  ('gls',        '1',    'PL', 'GLS',             'home',   NULL),
  ('gls',        '2',    'PL', 'GLS',             'pickup', NULL),
  ('ppl',        '2',    'PL', 'PPL',             'home',   'DHL'),
  -- CH
  ('dpd',        '1',    'CH', 'DPD',             'home',   NULL)
ON CONFLICT (lokia_carrier_code, lokia_service_type, country_code) DO NOTHING;
