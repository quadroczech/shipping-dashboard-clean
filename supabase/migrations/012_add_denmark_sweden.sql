-- Add Denmark (DK) and Sweden (SE) to the dashboard.
-- Carrier data (country_carriers, base prices, customer prices) will be added
-- separately via the app UI. This migration only seeds the countries and their
-- default exchange rates so the new currencies (DKK, SEK) resolve everywhere.

-- ─── Countries ────────────────────────────────────────────────────────────────
INSERT INTO countries (code, name, eshop_url, currency, flag, vat_rate) VALUES
  ('DK', 'Dánsko',  'www.example-shop.dk', 'DKK', '🇩🇰', 0.25),
  ('SE', 'Švédsko', 'www.example-shop.se', 'SEK', '🇸🇪', 0.25)
ON CONFLICT (code) DO NOTHING;

-- ─── Default exchange rates (CNB cron will keep these current) ────────────────
-- DKK is pegged to EUR (~7.46), SEK floats (~11.3 per EUR).
INSERT INTO exchange_rates (from_currency, to_currency, rate, date) VALUES
  ('DKK', 'CZK', 3.38, CURRENT_DATE),
  ('SEK', 'CZK', 2.23, CURRENT_DATE)
ON CONFLICT (from_currency, to_currency, date) DO NOTHING;
