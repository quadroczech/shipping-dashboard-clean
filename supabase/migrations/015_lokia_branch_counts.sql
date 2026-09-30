-- 015: branch-count helper for the /zasilky "unmapped BranchId" panel.
-- Returns Packeta document counts per (country, BranchId) so the UI can show
-- which BranchIds aren't yet mapped to a carrier in lokia_branch_map.
CREATE OR REPLACE FUNCTION lokia_branch_counts()
RETURNS TABLE(country_code text, branch_id text, doc_count bigint)
LANGUAGE sql STABLE AS $$
  SELECT UPPER(country_code) AS country_code, branch_id, COUNT(*) AS doc_count
  FROM lokia_document_detail_cache
  WHERE carrier_code = 'zasilkovna' AND branch_id IS NOT NULL AND branch_id <> ''
  GROUP BY UPPER(country_code), branch_id
$$;
