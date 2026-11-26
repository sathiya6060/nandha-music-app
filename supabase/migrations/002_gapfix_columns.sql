-- ============================================================================
-- Nandha Music — 002_gapfix_columns.sql (M2 — OpenCodeReview, 27 Nov 2026)
--
-- The TrackEditor collects hook timing, lyricist, description, story and
-- scheduled-at, but 001_schema.sql had no columns for them, so the
-- Supabase save path silently DROPPED all six values while reporting
-- success. These columns close that gap. featuredArtists deliberately
-- has NO column: the editor shows a "not stored yet" note instead of
-- silently discarding it (see src/admin/TrackEditor.jsx).
--
-- Apply in the Supabase SQL Editor (parent dashboard step) BEFORE the
-- next deploy that reads them: src/lib/supabaseCatalog.js selects
-- these columns, and retries with the legacy column list (code 42703)
-- until this migration is applied, so the app keeps working on the
-- fallback in the meantime. Idempotent — re-running is safe.
-- ============================================================================

alter table public.tracks
  add column if not exists hook_start_sec integer,
  add column if not exists hook_duration_sec integer,
  add column if not exists lyricist text,
  add column if not exists description text,
  add column if not exists story text,
  add column if not exists scheduled_at timestamptz;

-- NOTE: there is NO automatic publish. A row with status 'scheduled'
-- stays hidden until an admin flips it to 'published' — the editor
-- says so next to the scheduled-at field. Do not add a cron/pg_cron
-- auto-publish here; that is a product decision, not a schema fix.
