-- ============================================================
-- Competitor shipping prices (page /trh — Průzkum trhu)
-- Manually entered prices charged by competing e-shops, compared
-- with our own customer prices per country and delivery type.
-- ============================================================

CREATE TABLE IF NOT EXISTS competitor_prices (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id       UUID          NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  competitor_name  VARCHAR(200)  NOT NULL,
  competitor_url   TEXT,
  delivery_type    VARCHAR(10)   NOT NULL CHECK (delivery_type IN ('home', 'pickup')),
  carrier_name     VARCHAR(100),               -- e.g. PPL, GLS, Packeta
  carrier_label    VARCHAR(200),               -- service label as shown by the competitor
  price            NUMERIC(10,2),
  free_from        NUMERIC(10,2),              -- free-shipping threshold
  currency         VARCHAR(3)    NOT NULL DEFAULT 'CZK',
  checked_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  notes            TEXT
);

CREATE INDEX IF NOT EXISTS idx_competitor_prices_country ON competitor_prices(country_id);

-- The app has no user login and talks to Supabase with the anon key (see the
-- "Security" section of the README). Same access model as the other tables,
-- see 004_lokia_cache_rls.sql. If you deploy this anywhere reachable from the
-- internet, protect the app (Vercel password protection / SSO) or add Supabase
-- Auth + row level security policies and drop these grants.
ALTER TABLE competitor_prices DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON competitor_prices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON competitor_prices TO authenticated;
