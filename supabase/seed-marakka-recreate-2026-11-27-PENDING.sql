-- ============================================================================
-- Nandha Music — RE-CREATE the Marakka Mudiyuma track + lyrics
-- *** PENDING — NOT APPLIED. Run in the Supabase SQL Editor (dashboard). ***
-- Prepared 27 Nov 2026 20:03 IST. Sathiya deleted the Marakka track
-- himself (19:56 IST); the lyrics row went with it, but the album
-- "Marakka Mudiyuma" and the Storage files (audio + cover) survive.
-- The browser admin re-upload FAILED (20:03 IST): the New Track form
-- saves silently fail — "Saving…" hangs 60-90s then reverts to "Save
-- Track" with no error and no navigation, for both Published and Draft.
-- The form also shows "Demo mode — changes are saved in this browser
-- only" under Audio, and an "Admin role not set up in the database yet"
-- banner. So the admin write path itself needs a code fix (separate
-- work); this SQL restores the track the proven way (same route as the
-- 19:49 IST publish SQL).
-- Safe to run once; re-running fails on the slug unique constraint
-- (intended — the track will exist by then).
-- ============================================================================

insert into public.tracks
  (slug, title_en, title_ta, artist_id, album_id, composer, lyricist,
   genre, language, duration_sec, audio_128_url, audio_320_url, cover_url,
   status, release_date, hook_start_sec, hook_duration_sec)
select
  'marakka-mudiyuma', 'Marakka Mudiyuma', 'மறக்க முடியுமா?',
  '24f966e7-6182-4ee9-aab8-668b64ff96c0',
  (select id from public.albums where title_en = 'Marakka Mudiyuma'
   order by created_at limit 1),
  'Siddha Guruji', null, 'Love', 'Tamil', 254,
  'audio/marakka-mudiyuma.mp3',
  'audio/marakka-mudiyuma.mp3',
  'https://qldhyzgpxuzpsymongvf.supabase.co/storage/v1/object/public/covers/marakka-mudiyuma-cover-800.jpg',
  'published', null, null, null;

-- Marakka lyrics — 32 lines, UNSYNCED (same verified text as before).
insert into public.lyrics (track_id, lang, lines, synced)
select id, 'ta', $lyr$[{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"எங்கு நீ சென்றாலும் மறக்கமுடியுமா","startSec":null},{"text":"என்னை விட்டு உன் நினைவை மாற்றமுடியுமா","startSec":null},{"text":"பெண்ணை விட்டு பேரழகை பிரிக்கமுடியுமா","startSec":null},{"text":"பேச்சை விட்டு ஒலியை தனியே எடுக்கமுடியுமா","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"எங்கு நீ சென்றாலும் மறக்கமுடியுமா","startSec":null},{"text":"என்னை விட்டு உன் நினைவை மாற்றமுடியுமா","startSec":null},{"text":"பெண்ணை விட்டு பேரழகை பிரிக்கமுடியுமா","startSec":null},{"text":"பேச்சை விட்டு ஒலியை தனியே எடுக்கமுடியுமா","startSec":null},{"text":"இணைந்த இரு உள்ளங்கள் பிரிவதுமில்லை","startSec":null},{"text":"இருவரும் காதலிலே தோற்பதுமில்லை","startSec":null},{"text":"அணைத்த இருகரங்கள் விலகுவதில்லை","startSec":null},{"text":"அன்பை அழிக்கும் ஆயுதம் இதுவரை இல்லை","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"எங்கு நீ சென்றாலும் மறக்கமுடியுமா","startSec":null},{"text":"என்னை விட்டு உன் நினைவை மாற்றமுடியுமா","startSec":null},{"text":"பெண்ணை விட்டு பேரழகை பிரிக்கமுடியுமா","startSec":null},{"text":"பேச்சை விட்டு ஒலியை தனியே எடுக்கமுடியுமா","startSec":null},{"text":"அன்று உன்னை பார்த்த போது ஓவியமாச்சு","startSec":null},{"text":"அன்பாக பேசியவை காவியமாச்சு","startSec":null},{"text":"இன்று இவையனைத்தும் கனவுபோலாச்சு","startSec":null},{"text":"என் இதயமேடை தனில் ஒரு நாடகமாச்சு","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"எங்கு நீ சென்றாலும் மறக்கமுடியுமா","startSec":null},{"text":"என்னை விட்டு உன் நினைவை மாற்றமுடியுமா","startSec":null},{"text":"பெண்ணை விட்டு பேரழகை பிரிக்கமுடியுமா","startSec":null},{"text":"பேச்சை விட்டு ஒலியை தனியே எடுக்கமுடியுமா","startSec":null}]$lyr$::jsonb, false
from public.tracks where slug = 'marakka-mudiyuma'
on conflict (track_id, lang) do update
  set lines = excluded.lines, synced = excluded.synced;

-- Verification — expect 3 published tracks + 3 lyrics rows again.
select slug, title_en, composer, genre, duration_sec, status,
       audio_320_url, cover_url
from public.tracks where status = 'published' order by created_at;

select track_id, lang, synced, jsonb_array_length(lines) as line_count
from public.lyrics order by track_id;
