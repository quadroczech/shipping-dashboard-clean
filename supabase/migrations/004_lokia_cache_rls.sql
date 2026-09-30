-- Ensure server-side sync can write to these tables regardless of which key
-- is used (anon fallback or service role). Tables contain no user-sensitive data.

-- Disable RLS (enabled by default in some Supabase projects for SQL-created tables)
ALTER TABLE lokia_document_detail_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE balikobot_stats DISABLE ROW LEVEL SECURITY;

-- Grant write access to anon/authenticated so the sync works with anon key fallback
GRANT SELECT, INSERT, UPDATE, DELETE ON balikobot_stats TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON balikobot_stats TO authenticated;

-- lokia_document_detail_cache grants were added in migration 003, but repeat
-- here in case they weren't applied (idempotent).
GRANT SELECT, INSERT, UPDATE, DELETE ON lokia_document_detail_cache TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON lokia_document_detail_cache TO authenticated;
