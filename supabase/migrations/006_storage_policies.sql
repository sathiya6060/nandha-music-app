-- ============================================================================
-- 006_storage_policies.sql — Storage RLS for the audio/covers buckets
-- (security audit 28 Nov 2026, M3: no storage policy existed in the
-- repo; the 7 live policies could not be verified from code)
-- ============================================================================
-- Buckets (from code — supabaseAdmin.js uploadAudio/uploadCover):
--   audio  (private): admin uploads `audio/<slug>.mp3` via the anon-key
--          client (user JWT), so Storage RLS DOES gate the upload.
--          Playback is by signed URL minted with the service_role key
--          (get-audio-url), which bypasses RLS — so NO public SELECT
--          policy is needed, or wanted, for audio.
--   covers (public): admin uploads `covers/<slug>-<ts>.<ext>` the same
--          way; reads are public getPublicUrl() links rendered in
--          <img> tags, so covers need a public SELECT policy.
--
-- IDEMPOTENT: every policy is dropped before it is created. Safe to
-- re-run. If the live DB already has storage policies under DIFFERENT
-- names, this file adds these alongside them — check the live list
-- afterwards and remove any conflicting older policy (see the verify
-- query at the bottom). Do NOT delete a live policy before confirming
-- the replacement is in place, or uploads break.
--
-- UNCERTAINTY (flagged, parent verifies live): the exact live bucket
-- policy intent could not be determined from code (no storage.objects
-- policy, no config.toml in the repo). This file is the CONSERVATIVE
-- version derived from how the code uses the buckets. If live uploads
-- ever used the service_role key directly they would bypass these
-- policies entirely (no harm); if some other client uploads covers
-- as a non-admin, that upload will now 403 — that is the intended
-- admin-only rule, but confirm no such flow exists before applying.
--
-- APPLY: Supabase dashboard → SQL Editor → paste → Run.
-- ============================================================================

-- -- audio bucket (private): admin-only everything. ---------------------
drop policy if exists "audio: admin select" on storage.objects;
drop policy if exists "audio: admin insert" on storage.objects;
drop policy if exists "audio: admin update" on storage.objects;
drop policy if exists "audio: admin delete" on storage.objects;

-- Admins may list/inspect their own bucket objects (dashboard/debug);
-- playback does NOT need this (signed URLs bypass RLS).
create policy "audio: admin select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'audio' and public.is_admin());

create policy "audio: admin insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'audio' and public.is_admin());

create policy "audio: admin update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'audio' and public.is_admin())
  with check (bucket_id = 'audio' and public.is_admin());

create policy "audio: admin delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'audio' and public.is_admin());

-- -- covers bucket (public read, admin-only write). ----------------------
drop policy if exists "covers: public read" on storage.objects;
drop policy if exists "covers: admin insert" on storage.objects;
drop policy if exists "covers: admin update" on storage.objects;
drop policy if exists "covers: admin delete" on storage.objects;

create policy "covers: public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'covers');

create policy "covers: admin insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'covers' and public.is_admin());

create policy "covers: admin update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'covers' and public.is_admin())
  with check (bucket_id = 'covers' and public.is_admin());

create policy "covers: admin delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'covers' and public.is_admin());

-- Verify (expect: 8 policies, 4 per bucket; compare against the live
-- list BEFORE applying and remove any older same-bucket policy that
-- contradicts these, e.g. a public audio SELECT):
--   select policyname, cmd, roles from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--   order by policyname;
