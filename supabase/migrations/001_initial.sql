-- ============================================================
-- Shipping Dashboard – Initial Schema
-- Run this in Supabase → SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Countries ───────────────────────────────────────────────────────────────
CREATE TABLE countries (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(5)   NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  eshop_url   VARCHAR(200) NOT NULL,
  currency    VARCHAR(3)   NOT NULL,
  flag        VARCHAR(10)  NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Carriers ─────────────────────────────────────────────────────────────────
CREATE TABLE carriers (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                VARCHAR(30)  NOT NULL UNIQUE,
  name                VARCHAR(100) NOT NULL,
  logo_color          VARCHAR(10)  NOT NULL DEFAULT '#666666',
  website_url         VARCHAR(300),
  fuel_surcharge_url  VARCHAR(500),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Country × Carrier mapping ───────────────────────────────────────────────
CREATE TABLE country_carriers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id       UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  carrier_id       UUID NOT NULL REFERENCES carriers(id)  ON DELETE CASCADE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  contract_start   DATE,
  contract_end     DATE,
  contract_notes   TEXT,
  UNIQUE (country_id, carrier_id)
);

-- ─── Carrier base prices ──────────────────────────────────────────────────────
CREATE TABLE carrier_base_prices (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_carrier_id  UUID    NOT NULL REFERENCES country_carriers(id) ON DELETE CASCADE,
  weight_from         NUMERIC(6,3) NOT NULL DEFAULT 0,
  weight_to           NUMERIC(6,3) NOT NULL,           -- kg
  base_price          NUMERIC(10,2) NOT NULL,
  currency            VARCHAR(3)  NOT NULL,
  valid_from          DATE        NOT NULL DEFAULT CURRENT_DATE,
  valid_to            DATE,
  notes               TEXT
);

-- ─── Customer prices ──────────────────────────────────────────────────────────
CREATE TABLE customer_prices (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_carrier_id      UUID    NOT NULL REFERENCES country_carriers(id) ON DELETE CASCADE,
  price                   NUMERIC(10,2) NOT NULL,
  currency                VARCHAR(3)    NOT NULL,
  free_shipping_threshold NUMERIC(10,2),
  valid_from              DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to                DATE,
  notes                   TEXT
);

-- ─── Return (reverse logistics) prices ───────────────────────────────────────
CREATE TABLE return_prices (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_carrier_id  UUID    NOT NULL REFERENCES country_carriers(id) ON DELETE CASCADE,
  price               NUMERIC(10,2) NOT NULL,
  currency            VARCHAR(3)    NOT NULL,
  valid_from          DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to            DATE,
  notes               TEXT
);

-- ─── Surcharges ───────────────────────────────────────────────────────────────
CREATE TABLE surcharges (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_carrier_id  UUID    NOT NULL REFERENCES country_carriers(id) ON DELETE CASCADE,
  type                VARCHAR(30) NOT NULL,    -- fuel, toll, cod, cod_card, ...
  label               VARCHAR(100),            -- optional custom label
  value               NUMERIC(8,4) NOT NULL,   -- percentage or fixed amount
  is_percentage       BOOLEAN NOT NULL DEFAULT TRUE,
  currency            VARCHAR(3),              -- only if is_percentage = false
  valid_from          DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to            DATE,
  source_url          VARCHAR(500),
  auto_updated        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Exchange rates ───────────────────────────────────────────────────────────
CREATE TABLE exchange_rates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_currency   VARCHAR(3) NOT NULL,
  to_currency     VARCHAR(3) NOT NULL DEFAULT 'CZK',
  rate            NUMERIC(12,6) NOT NULL,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (from_currency, to_currency, date)
);

-- ─── Invoices ─────────────────────────────────────────────────────────────────
CREATE TABLE invoices (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_carrier_id  UUID    NOT NULL REFERENCES country_carriers(id) ON DELETE CASCADE,
  invoice_number      VARCHAR(100) NOT NULL,
  invoice_date        DATE NOT NULL,
  period_month        VARCHAR(7) NOT NULL,     -- YYYY-MM
  total_amount        NUMERIC(12,2) NOT NULL,
  currency            VARCHAR(3)    NOT NULL,
  shipment_count      INTEGER,
  contracted_total    NUMERIC(12,2),
  variance_amount     NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - contracted_total) STORED,
  variance_pct        NUMERIC(8,4)  GENERATED ALWAYS AS (
    CASE WHEN contracted_total > 0
      THEN (total_amount - contracted_total) / contracted_total * 100
      ELSE NULL
    END
  ) STORED,
  file_url            VARCHAR(500),
  status              VARCHAR(20) NOT NULL DEFAULT 'pending',
  notes               TEXT,
  parsed_data         JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Balíkobot shipment stats ─────────────────────────────────────────────────
CREATE TABLE balikobot_stats (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id      UUID NOT NULL REFERENCES countries(id)  ON DELETE CASCADE,
  carrier_id      UUID NOT NULL REFERENCES carriers(id)   ON DELETE CASCADE,
  month           VARCHAR(7) NOT NULL,   -- YYYY-MM
  shipment_count  INTEGER    NOT NULL DEFAULT 0,
  return_count    INTEGER,
  cod_count       INTEGER,
  avg_weight      NUMERIC(6,3),
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (country_id, carrier_id, month)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_cc_country    ON country_carriers(country_id);
CREATE INDEX idx_cc_carrier    ON country_carriers(carrier_id);
CREATE INDEX idx_surcharges_cc ON surcharges(country_carrier_id);
CREATE INDEX idx_invoices_cc   ON invoices(country_carrier_id);
CREATE INDEX idx_invoices_month ON invoices(period_month);
CREATE INDEX idx_balikobot_month ON balikobot_stats(month);
CREATE INDEX idx_exchange_rates_date ON exchange_rates(date);

-- ─── Seed: Countries ─────────────────────────────────────────────────────────
INSERT INTO countries (code, name, eshop_url, currency, flag) VALUES
  ('CZ',  'Česká republika', 'www.example-shop.cz',  'CZK', '🇨🇿'),
  ('SK',  'Slovensko',       'www.example-shop.sk',  'EUR', '🇸🇰'),
  ('HU',  'Maďarsko',        'www.example-shop.hu',  'HUF', '🇭🇺'),
  ('RO',  'Rumunsko',        'www.example-shop.ro',  'RON', '🇷🇴'),
  ('DE',  'Německo',         'www.example-shop.de',  'EUR', '🇩🇪'),
  ('AT',  'Rakousko',        'www.example-shop.at',  'EUR', '🇦🇹'),
  ('BE',  'Belgie',          'www.example-shop.be',  'EUR', '🇧🇪'),
  ('NL',  'Nizozemsko',      'www.example-shop.nl',  'EUR', '🇳🇱'),
  ('COM', 'Mezinárodní',     'www.example-shop.com', 'EUR', '🌍'),
  ('PL',  'Polsko',          'www.example-shop.pl',  'PLN', '🇵🇱'),
  ('FR',  'Francie',         'www.example-shop.fr',  'EUR', '🇫🇷'),
  ('CH',  'Švýcarsko',       'www.example-shop.ch',  'CHF', '🇨🇭'),
  ('IT',  'Itálie',          'www.example-shop.it',  'EUR', '🇮🇹');

-- ─── Seed: Carriers ───────────────────────────────────────────────────────────
INSERT INTO carriers (code, name, logo_color, website_url, fuel_surcharge_url) VALUES
  ('PPL',             'PPL',                 '#E30613', 'https://www.ppl.cz',         'https://www.ppl.cz/priplatky'),
  ('GLS',             'GLS',                 '#009900', 'https://gls-group.com',      'https://gls-group.com/CZ/cs/surcharges.html'),
  ('PACKETA',         'Zásilkovna / Packeta','#BA2228', 'https://www.packeta.com',    'https://www.zasilkovna.cz/ceniky-a-priplatky'),
  ('SLOVENSKA_POSTA', 'Slovenská pošta',     '#F7941D', 'https://www.posta.sk',       NULL);

-- ─── Seed: Country–Carrier mappings ──────────────────────────────────────────
DO $$
DECLARE
  v_country UUID; v_carrier UUID;
  pairs TEXT[][] := ARRAY[
    ['CZ','PPL'],['CZ','GLS'],['CZ','PACKETA'],
    ['SK','PPL'],['SK','GLS'],['SK','PACKETA'],['SK','SLOVENSKA_POSTA'],
    ['HU','PPL'],['HU','GLS'],['HU','PACKETA'],
    ['RO','PPL'],['RO','GLS'],['RO','PACKETA'],
    ['DE','PPL'],['DE','GLS'],
    ['AT','PPL'],['AT','GLS'],
    ['BE','PPL'],['BE','GLS'],['BE','PACKETA'],
    ['NL','PPL'],['NL','GLS'],
    ['COM','GLS'],
    ['PL','PPL'],['PL','GLS'],
    ['FR','PPL'],['FR','GLS'],['FR','PACKETA'],
    ['CH','PACKETA'],
    ['IT','PPL'],['IT','GLS'],['IT','PACKETA']
  ];
  pair TEXT[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY pairs LOOP
    SELECT id INTO v_country FROM countries WHERE code = pair[1];
    SELECT id INTO v_carrier FROM carriers  WHERE code = pair[2];
    IF v_country IS NOT NULL AND v_carrier IS NOT NULL THEN
      INSERT INTO country_carriers (country_id, carrier_id) VALUES (v_country, v_carrier)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- ─── Seed: Default exchange rates ────────────────────────────────────────────
INSERT INTO exchange_rates (from_currency, to_currency, rate, date) VALUES
  ('EUR', 'CZK', 25.20, CURRENT_DATE),
  ('HUF', 'CZK', 0.065, CURRENT_DATE),
  ('RON', 'CZK', 5.07, CURRENT_DATE),
  ('PLN', 'CZK', 5.90, CURRENT_DATE),
  ('CHF', 'CZK', 28.10, CURRENT_DATE),
  ('GBP', 'CZK', 31.50, CURRENT_DATE),
  ('CZK', 'CZK', 1.00, CURRENT_DATE);
