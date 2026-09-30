-- Cache for Lokia document details fetched via /v3/documents/detail/{documentNumber}.
-- Avoids re-fetching on every sync run; rows persist across syncs.
-- Cleared per-month when a sync completes all documents for that month.
CREATE TABLE IF NOT EXISTS lokia_document_detail_cache (
  document_number TEXT PRIMARY KEY,
  month           TEXT NOT NULL,       -- YYYY-MM derived from CompletedDate/CreatedDate
  carrier_code    TEXT,                -- raw value from PackageInformation.CarrierCode
  country_code    TEXT,                -- raw value from PackageInformation.CountryCode
  cod_price       NUMERIC,
  weight          NUMERIC,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lokia_cache_month ON lokia_document_detail_cache(month);

-- Grant access to PostgREST roles (required for tables created via SQL Editor)
GRANT SELECT, INSERT, UPDATE, DELETE ON lokia_document_detail_cache TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON lokia_document_detail_cache TO authenticated;
