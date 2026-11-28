-- 010: tighten play_events insert policy — require the caller's own id.
--
-- WHY: migration 005 deliberately allowed user_id NULL because
-- flushPlays (src/lib/cache.js) inserted rows with user_id omitted.
-- flushPlays now sends the caller's id when signed in (28 Nov 2026),
-- so the policy can finally require it: no one may attribute plays
-- to another user, and unattributed rows are gone.
--
-- DO NOT APPLY LIVE UNTIL the flushPlays change is deployed AND
-- verified live (signed-in plays carry user_id). Applying it first
-- would break signed-in play counting for any client still running
-- the old JS (cached bundles) — the exact failure 005 warned about.
-- Guest (anon) inserts stay blocked as before: anon holds no INSERT
-- grant on play_events at all (001 grants).
--
-- Apply in the Supabase SQL editor, then verify:
--   select user_id, count(*) from public.play_events
--   group by user_id order by 2 desc limit 5;
-- (user_id should be non-NULL for signed-in plays after the deploy.)

drop policy if exists "play_events: authenticated insert" on public.play_events;

create policy "play_events: authenticated insert"
  on public.play_events for insert
  with check (
    user_id = auth.uid()
    and count <= 1
  );
