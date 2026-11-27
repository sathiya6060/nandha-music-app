-- ============================================================================
-- Nandha Music — RE-CREATE the Vaazhvinil Orumurayenum track + lyrics
-- *** PENDING — NOT APPLIED. Run in the Supabase SQL Editor (dashboard). ***
-- Prepared 27 Nov 2026 21:02 IST. The Vaazhvinil track row (was id
-- 485b5cdc-0a86-4501-be2d-90b64a3a3657) + its 40-line lyrics row went
-- MISSING from the DB between the 20:08 IST 3-song verification and the
-- ~20:47 IST demo-removal deploy. The deploy is code-only (Cloudflare
-- Pages) and cannot delete DB rows — who deleted it is unknown; Sathiya
-- deleted Marakka himself the same way at 19:56 IST, so ask him first.
-- The Annamalaiyar album + the Storage audio file survive, and the app
-- still serves the song from its seed fallback (/track/vaazhvinil-
-- orumurayenum plays the real 224s audio, gate 5.21s) — only the DB row
-- + lyrics are missing.
-- Metadata below is from the app's own seed catalog (src/data/catalog.js):
-- genre Devotional, composer Siddha Guruji, release 2026-12-10, hook 0/30s.
-- Lyrics are the 40 verified lines, UNSYNCED (no timings in the file).
-- Safe to run once; re-running fails on the slug unique constraint
-- (intended — the track will exist by then).
-- ============================================================================

insert into public.tracks
  (slug, title_en, title_ta, artist_id, album_id, composer, lyricist,
   genre, language, duration_sec, audio_128_url, audio_320_url, cover_url,
   status, release_date, hook_start_sec, hook_duration_sec)
select
  'vaazhvinil-orumurayenum', 'Vaazhvinil Orumurayenum', 'வாழ்வினில் ஒருமுறையேனும்',
  '24f966e7-6182-4ee9-aab8-668b64ff96c0',
  (select id from public.albums where title_en = 'Annamalaiyar'
   order by created_at limit 1),
  'Siddha Guruji', null, 'Devotional', 'Tamil', 224,
  'audio/vaazhvinil-orumurayenum.mp3',
  'audio/vaazhvinil-orumurayenum.mp3',
  '/assets/vaazhvinil-cover-800.webp',
  'published', '2026-12-10', 0, 30;

-- Vaazhvinil lyrics — 40 lines, UNSYNCED (verified text, 27 Nov 2026).
insert into public.lyrics (track_id, lang, lines, synced)
select id, 'ta', $lyr$[{"text":"வாழ்வினில் ஒருமுறையேனும்","startSec":null},{"text":"அந்த மலையை சுற்றிவர வேண்டும்","startSec":null},{"text":"வாழ்க்கையின் நோக்கமும் புரியும்","startSec":null},{"text":"அண்ணாமலையானின் பேரருளும் கிடைக்கும்","startSec":null},{"text":"வாழ்வினில் ஒருமுறையேனும்","startSec":null},{"text":"அந்த மலையை சுற்றிவர வேண்டும்","startSec":null},{"text":"வாழ்க்கையின் நோக்கமும் புரியும்","startSec":null},{"text":"அண்ணாமலையானின் பேரருளும் கிடைக்கும்","startSec":null},{"text":"கலியுகத்தில் கல்லாக இருக்கும்","startSec":null},{"text":"கண்கண்ட தெய்வமாய் விளங்கும்","startSec":null},{"text":"கலியுகத்தில் கல்லாக இருக்கும்","startSec":null},{"text":"கண்கண்ட தெய்வமாய் விளங்கும்","startSec":null},{"text":"திருவண்ணாமலையாரை வணங்க","startSec":null},{"text":"தினம் தினம் அற்புதம் நடக்கும்","startSec":null},{"text":"திருவண்ணாமலையாரை வணங்க","startSec":null},{"text":"தினம் தினம் அற்புதம் நடக்கும்","startSec":null},{"text":"வாழ்வினில் ஒருமுறையேனும்","startSec":null},{"text":"அந்த மலையை சுற்றிவர வேண்டும்","startSec":null},{"text":"வாழ்க்கையின் நோக்கமும் புரியும்","startSec":null},{"text":"அண்ணாமலையானின் பேரருளும் கிடைக்கும்","startSec":null},{"text":"வாழ்வினில் ஒருமுறையேனும்","startSec":null},{"text":"அந்த மலையை சுற்றிவர வேண்டும்","startSec":null},{"text":"வாழ்க்கையின் நோக்கமும் புரியும்","startSec":null},{"text":"அண்ணாமலையானின் பேரருளும் கிடைக்கும்","startSec":null},{"text":"ஊழ்வினை மெல்ல அழியும்","startSec":null},{"text":"உள்ளத்துள் பேரமைதி பிறக்கும்","startSec":null},{"text":"ஊழ்வினை மெல்ல அழியும்","startSec":null},{"text":"உள்ளத்துள் பேரமைதி பிறக்கும்","startSec":null},{"text":"நாள் முழுதும் நல்லவை நடக்கும்","startSec":null},{"text":"நன்றாக மெய்ஞானம் கூடும்","startSec":null},{"text":"நாள் முழுதும் நல்லவை நடக்கும்","startSec":null},{"text":"நன்றாக மெய்ஞானம் கூடும்","startSec":null},{"text":"வாழ்வினில் ஒருமுறையேனும்","startSec":null},{"text":"அந்த மலையை சுற்றிவர வேண்டும்","startSec":null},{"text":"வாழ்க்கையின் நோக்கமும் புரியும்","startSec":null},{"text":"அண்ணாமலையானின் பேரருளும் கிடைக்கும்","startSec":null},{"text":"வாழ்வினில் ஒருமுறையேனும்","startSec":null},{"text":"அந்த மலையை சுற்றிவர வேண்டும்","startSec":null},{"text":"வாழ்க்கையின் நோக்கமும் புரியும்","startSec":null},{"text":"அண்ணாமலையானின் பேரருளும் கிடைக்கும்","startSec":null}]$lyr$::jsonb, false
from public.tracks where slug = 'vaazhvinil-orumurayenum'
on conflict (track_id, lang) do update
  set lines = excluded.lines, synced = excluded.synced;

-- Verification — expect 3 published tracks + 3 lyrics rows again.
select slug, title_en, composer, genre, duration_sec, status,
       audio_320_url, cover_url
from public.tracks where status = 'published' order by created_at;

select track_id, lang, synced, jsonb_array_length(lines) as line_count
from public.lyrics order by track_id;
