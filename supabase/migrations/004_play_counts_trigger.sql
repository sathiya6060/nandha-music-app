-- ============================================================================
-- 004_play_counts_trigger.sql — Play counts (E2E bug #11, 27 Nov 2026)
-- ============================================================================
-- The client buffers plays and flushes them to public.play_events
-- (src/lib/cache.js recordPlay/flushPlays), but the admin dashboard reads
-- public.tracks.plays — and nothing ever updated that column, so admin
-- showed 0 plays forever even after full song plays. Fix: a trigger
-- increments tracks.plays on every play_events insert.
--
-- RUN ONCE via the Supabase dashboard SQL Editor (project nandha-music).
-- The backfill below is a one-time catch-up for rows already in
-- play_events; do NOT re-run it (it would count those rows twice).
-- The trigger itself is idempotent (drop + create).
-- ============================================================================

create or replace function public.increment_track_plays()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.tracks
  set plays = coalesce(plays, 0) + coalesce(new.count, 1)
  where id = new.track_id;
  return new;
end;
$$;

drop trigger if exists trg_play_events_increment_plays on public.play_events;

create trigger trg_play_events_increment_plays
after insert on public.play_events
for each row execute function public.increment_track_plays();

-- One-time backfill: count the play_events rows that arrived before this
-- trigger existed (e.g. plays from the 28 Nov 2026 verification session).
-- IDEMPOTENCY GUARD (L1, 28 Nov 2026): only tracks still at plays = 0
-- are backfilled, so a re-run can never double-count rows the trigger
-- (or a previous backfill) already counted. A track whose plays are
-- already > 0 is skipped entirely — a re-run may UNDER-count such a
-- track, never over-count it. Still: do NOT re-run this file live
-- without cause; it was already applied once.
update public.tracks t
set plays = coalesce(t.plays, 0) + s.total
from (
  select track_id, sum(count)::bigint as total
  from public.play_events
  group by track_id
) s
where t.id = s.track_id
  and coalesce(t.plays, 0) = 0;

-- Verify (expect: trigger listed; tracks.plays now includes backfilled rows):
--   select trigger_name from information_schema.triggers
--     where event_object_table = 'play_events';
--   select slug, plays from public.tracks order by plays desc;
