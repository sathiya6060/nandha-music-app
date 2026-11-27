-- ============================================================================
-- Nandha Music — SEED: Malaiyoram + Marakka (new tracks) + Vaazhvinil lyrics
-- *** PENDING — NOT APPLIED. Run in the Supabase SQL Editor (dashboard). ***
-- Prepared 27 Nov 2026. Do NOT run before the Storage uploads below are done.
--
-- PREREQUISITES (dashboard, in order):
--   1. Storage -> bucket "audio" (PRIVATE): upload
--        audio/malaiyoram-veesiya-kaatre.mp3
--          from ~/workspace/instagram/audio/malaiyoram-veesiya-kaatre-full-320kbps-44.1kHz.mp3
--          (14,056,104 bytes, 351.34s, 320kbps — VERIFIED full song)
--        audio/marakka-mudiyuma.mp3
--          from ~/workspace/instagram/audio/marakka-mudiyuma-full-320kbps-44.1kHz.mp3
--          (10,156,545 bytes, 253.84s, 320kbps — VERIFIED full song)
--      Do NOT make the "audio" bucket public; playback is via signed URLs.
--   2. Storage -> bucket "covers" (PUBLIC — verify the Public toggle):
--      upload these two files with EXACTLY these names (the SQL below
--      references these URLs; rename the object and the URLs break):
--        malaiyoram-veesiya-kaatre-cover-800.jpg
--          from ~/workspace/instagram/covers/malaiyoram-veesiya-kaatre-cover-800.jpg
--          (800x800, full 16:9 frame letterboxed so the Tamil title is intact)
--        marakka-mudiyuma-cover-800.jpg
--          from ~/workspace/instagram/covers/marakka-mudiyuma-cover-800.jpg
--          (800x800, same letterbox treatment)
--      FLAG: both covers carry the OLD gold NM logo baked into the poster
--      (Malaiyoram top-right, Marakka top-left). Sathiya may replace them
--      with a fresh orange-N cover later; the track rows just point at URLs.
--   3. Run this script in the SQL Editor. It is safe to run once; re-running
--      fails on the track slug unique constraint (intended — delete the rows
--      to re-run). The Vaazhvinil lyrics insert is idempotent (ON CONFLICT).
--
-- FLAGS / JUDGEMENT CALLS (see the upload report for detail):
--   * Malaiyoram composer = NULL: no composer credit found in any workspace
--     file. Do NOT assume Siddha Guruji. Sathiya to confirm.
--   * Marakka composer = 'Siddha Guruji' per the RouteNote release details
--     (screenshot 25 Nov 2026) + Spotify credit. CONFLICT: the 2026 official
--     poster credits VOCALS/MUSIC/LYRICS/MIX & MASTER all to NANDHA.
--     Sathiya to confirm which credit the app should show.
--   * release_date = NULL for both new tracks/albums: no RouteNote/store
--     release date on record (Marakka is already on Spotify; its original
--     release date is not in the workspace).
--   * Malaiyoram hook_start_sec = 63, hook_duration_sec = 12: the verified
--     reel hook window (song 63.0-74.72s). Marakka hook = NULL (not measured).
--   * Malaiyoram lyrics: 32 SYNCED lines (word timestamps). The 2 'la la'
--     humming intro lines are OMITTED (no timestamps; 0-32.6s is music-only).
--   * Vaazhvinil lyrics: 40 lines, UNSYNCED (no timings in the verified
--     file). Replaces the 4 sample lines the app shows today.
--   * Marakka lyrics: 32 lines incl. 'Aahahaha' humming, UNSYNCED.
--   * Both new tracks are inserted as 'published' (real audio + cover).
--     M5 rule: a track may not be published without audio — the uploads in
--     steps 1-2 above satisfy this.
--   * Playlist "Best of Nandha" is NOT touched here (optional follow-up:
--     add the two new tracks to it from the admin UI).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Malaiyoram Veesiya Kaatre — album + track + synced lyrics
-- ---------------------------------------------------------------------------
with album as (
  insert into public.albums
    (title_en, title_ta, artist_id, genre, cover_url, release_date, status)
  values
    ('Malaiyoram Veesiya Kaatre', 'மலையோரம் வீசிய காற்றே',
     '24f966e7-6182-4ee9-aab8-668b64ff96c0', 'Love', 'https://qldhyzgpxuzpsymongvf.supabase.co/storage/v1/object/public/covers/malaiyoram-veesiya-kaatre-cover-800.jpg', null, 'published')
  returning id
), track as (
  insert into public.tracks
    (slug, title_en, title_ta, artist_id, album_id, composer, lyricist,
     genre, language, duration_sec, audio_128_url, audio_320_url, cover_url,
     status, release_date, hook_start_sec, hook_duration_sec)
  select
    'malaiyoram-veesiya-kaatre', 'Malaiyoram Veesiya Kaatre',
    'மலையோரம் வீசிய காற்றே',
    '24f966e7-6182-4ee9-aab8-668b64ff96c0', album.id, null, null,
    'Love', 'Tamil', 351,
    'audio/malaiyoram-veesiya-kaatre.mp3',
    'audio/malaiyoram-veesiya-kaatre.mp3',
    'https://qldhyzgpxuzpsymongvf.supabase.co/storage/v1/object/public/covers/malaiyoram-veesiya-kaatre-cover-800.jpg',
    'published', null, 63, 12
  from album
  returning id
)
insert into public.lyrics (track_id, lang, lines, synced)
select id, 'ta', $lyr$[{"text":"மலையோரம் வீசிய காற்றே - காவேரி","startSec":32.56},{"text":"கரையோரம் வீசிட வாவா","startSec":38.48},{"text":"மடலோரம் தூறிய பனியே - என்","startSec":47.8},{"text":"மனதோரம் பெய்திட வாவா","startSec":53.02},{"text":"மலையோரம் வீசிய காற்றே - காவேரி","startSec":63.0},{"text":"கரையோரம் வீசிட வாவா","startSec":70.82},{"text":"மடலோரம் தூறிய பனியே - என்","startSec":78.22},{"text":"மனதோரம் பெய்திட வாவா","startSec":83.86},{"text":"ஏழு ஜென்ம பந்தமென்ற ஒன்றுண்டு","startSec":93.56},{"text":"என் அருகில் வந்தால் அறிவதற்கு வாய்ப்புண்டு","startSec":99.52},{"text":"ஏழு ஜென்ம பந்தமென்ற ஒன்றுண்டு","startSec":108.28},{"text":"என் அருகில் வந்தால் அறிவதற்கு வாய்ப்புண்டு","startSec":114.54},{"text":"தூரத்தில் இருந்தென்ன பலனுண்டு - நான்","startSec":126.34},{"text":"தொட்டாலே நீ மலர இடமுண்டு","startSec":131.7},{"text":"தூரத்தில் இருந்தென்ன பலனுண்டு - நான்","startSec":141.58},{"text":"தொட்டாலே நீ மலர இடமுண்டு","startSec":146.96},{"text":"மலையோரம் வீசிய காற்றே - காவேரி","startSec":154.38},{"text":"கரையோரம் வீசிட வாவா","startSec":161.48},{"text":"மடலோரம் தூறிய பனியே - என்","startSec":169.62},{"text":"மனதோரம் பெய்திட வாவா","startSec":177.54},{"text":"அன்பாலே உந்தனிலே நான்பாதி","startSec":218.62},{"text":"அணைத்தாலே என்னோடு நீ ஹாதி","startSec":222.14},{"text":"அன்பாலே உந்தனிலே நான்பாதி","startSec":227.62},{"text":"அணைத்தாலே என்னோடு நீ ஹாதி","startSec":238.4},{"text":"எந்நாளும் எந்தனுக்கு நீ ராசி","startSec":245.54},{"text":"என் இதயம் வீற்றிருக்கும் மகராசி","startSec":247.14},{"text":"எந்நாளும் எந்தனுக்கு நீ ராசி","startSec":261.0},{"text":"என் இதயம் வீற்றிருக்கும் மகராசி","startSec":262.4},{"text":"மலையோரம் வீசிய காற்றே - காவேரி","startSec":276.32},{"text":"கரையோரம் வீசிட வாவா","startSec":284.0},{"text":"மடலோரம் தூறிய பனியே - என்","startSec":291.4},{"text":"மனதோரம் பெய்திட வாவா","startSec":299.92}]$lyr$::jsonb, true
from track;

-- ---------------------------------------------------------------------------
-- Marakka Mudiyuma — album + track + unsynced lyrics
-- ---------------------------------------------------------------------------
with album as (
  insert into public.albums
    (title_en, title_ta, artist_id, genre, cover_url, release_date, status)
  values
    ('Marakka Mudiyuma', 'மறக்க முடியுமா?',
     '24f966e7-6182-4ee9-aab8-668b64ff96c0', 'Love', 'https://qldhyzgpxuzpsymongvf.supabase.co/storage/v1/object/public/covers/marakka-mudiyuma-cover-800.jpg', null, 'published')
  returning id
), track as (
  insert into public.tracks
    (slug, title_en, title_ta, artist_id, album_id, composer, lyricist,
     genre, language, duration_sec, audio_128_url, audio_320_url, cover_url,
     status, release_date, hook_start_sec, hook_duration_sec)
  select
    'marakka-mudiyuma', 'Marakka Mudiyuma', 'மறக்க முடியுமா?',
    '24f966e7-6182-4ee9-aab8-668b64ff96c0', album.id, 'Siddha Guruji', null,
    'Love', 'Tamil', 254,
    'audio/marakka-mudiyuma.mp3',
    'audio/marakka-mudiyuma.mp3',
    'https://qldhyzgpxuzpsymongvf.supabase.co/storage/v1/object/public/covers/marakka-mudiyuma-cover-800.jpg',
    'published', null, null, null
  from album
  returning id
)
insert into public.lyrics (track_id, lang, lines, synced)
select id, 'ta', $lyr$[{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"எங்கு நீ சென்றாலும் மறக்கமுடியுமா","startSec":null},{"text":"என்னை விட்டு உன் நினைவை மாற்றமுடியுமா","startSec":null},{"text":"பெண்ணை விட்டு பேரழகை பிரிக்கமுடியுமா","startSec":null},{"text":"பேச்சை விட்டு ஒலியை தனியே எடுக்கமுடியுமா","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"எங்கு நீ சென்றாலும் மறக்கமுடியுமா","startSec":null},{"text":"என்னை விட்டு உன் நினைவை மாற்றமுடியுமா","startSec":null},{"text":"பெண்ணை விட்டு பேரழகை பிரிக்கமுடியுமா","startSec":null},{"text":"பேச்சை விட்டு ஒலியை தனியே எடுக்கமுடியுமா","startSec":null},{"text":"இணைந்த இரு உள்ளங்கள் பிரிவதுமில்லை","startSec":null},{"text":"இருவரும் காதலிலே தோற்பதுமில்லை","startSec":null},{"text":"அணைத்த இருகரங்கள் விலகுவதில்லை","startSec":null},{"text":"அன்பை அழிக்கும் ஆயுதம் இதுவரை இல்லை","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"எங்கு நீ சென்றாலும் மறக்கமுடியுமா","startSec":null},{"text":"என்னை விட்டு உன் நினைவை மாற்றமுடியுமா","startSec":null},{"text":"பெண்ணை விட்டு பேரழகை பிரிக்கமுடியுமா","startSec":null},{"text":"பேச்சை விட்டு ஒலியை தனியே எடுக்கமுடியுமா","startSec":null},{"text":"அன்று உன்னை பார்த்த போது ஓவியமாச்சு","startSec":null},{"text":"அன்பாக பேசியவை காவியமாச்சு","startSec":null},{"text":"இன்று இவையனைத்தும் கனவுபோலாச்சு","startSec":null},{"text":"என் இதயமேடை தனில் ஒரு நாடகமாச்சு","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"எங்கு நீ சென்றாலும் மறக்கமுடியுமா","startSec":null},{"text":"என்னை விட்டு உன் நினைவை மாற்றமுடியுமா","startSec":null},{"text":"பெண்ணை விட்டு பேரழகை பிரிக்கமுடியுமா","startSec":null},{"text":"பேச்சை விட்டு ஒலியை தனியே எடுக்கமுடியுமா","startSec":null}]$lyr$::jsonb, false
from track;

-- ---------------------------------------------------------------------------
-- Vaazhvinil Orumurayenum — real lyrics (replaces the 4 sample lines).
-- Audio row is NOT touched. Idempotent: re-running updates the same row.
-- ---------------------------------------------------------------------------
insert into public.lyrics (track_id, lang, lines, synced)
values
  ('485b5cdc-0a86-4501-be2d-90b64a3a3657', 'ta', $lyr$[{"text":"வாழ்வினில் ஒருமுறையேனும்","startSec":null},{"text":"அந்த மலையை சுற்றிவர வேண்டும்","startSec":null},{"text":"வாழ்க்கையின் நோக்கமும் புரியும்","startSec":null},{"text":"அண்ணாமலையானின் பேரருளும் கிடைக்கும்","startSec":null},{"text":"வாழ்வினில் ஒருமுறையேனும்","startSec":null},{"text":"அந்த மலையை சுற்றிவர வேண்டும்","startSec":null},{"text":"வாழ்க்கையின் நோக்கமும் புரியும்","startSec":null},{"text":"அண்ணாமலையானின் பேரருளும் கிடைக்கும்","startSec":null},{"text":"கலியுகத்தில் கல்லாக இருக்கும்","startSec":null},{"text":"கண்கண்ட தெய்வமாய் விளங்கும்","startSec":null},{"text":"கலியுகத்தில் கல்லாக இருக்கும்","startSec":null},{"text":"கண்கண்ட தெய்வமாய் விளங்கும்","startSec":null},{"text":"திருவண்ணாமலையாரை வணங்க","startSec":null},{"text":"தினம் தினம் அற்புதம் நடக்கும்","startSec":null},{"text":"திருவண்ணாமலையாரை வணங்க","startSec":null},{"text":"தினம் தினம் அற்புதம் நடக்கும்","startSec":null},{"text":"வாழ்வினில் ஒருமுறையேனும்","startSec":null},{"text":"அந்த மலையை சுற்றிவர வேண்டும்","startSec":null},{"text":"வாழ்க்கையின் நோக்கமும் புரியும்","startSec":null},{"text":"அண்ணாமலையானின் பேரருளும் கிடைக்கும்","startSec":null},{"text":"வாழ்வினில் ஒருமுறையேனும்","startSec":null},{"text":"அந்த மலையை சுற்றிவர வேண்டும்","startSec":null},{"text":"வாழ்க்கையின் நோக்கமும் புரியும்","startSec":null},{"text":"அண்ணாமலையானின் பேரருளும் கிடைக்கும்","startSec":null},{"text":"ஊழ்வினை மெல்ல அழியும்","startSec":null},{"text":"உள்ளத்துள் பேரமைதி பிறக்கும்","startSec":null},{"text":"ஊழ்வினை மெல்ல அழியும்","startSec":null},{"text":"உள்ளத்துள் பேரமைதி பிறக்கும்","startSec":null},{"text":"நாள் முழுதும் நல்லவை நடக்கும்","startSec":null},{"text":"நன்றாக மெய்ஞானம் கூடும்","startSec":null},{"text":"நாள் முழுதும் நல்லவை நடக்கும்","startSec":null},{"text":"நன்றாக மெய்ஞானம் கூடும்","startSec":null},{"text":"வாழ்வினில் ஒருமுறையேனும்","startSec":null},{"text":"அந்த மலையை சுற்றிவர வேண்டும்","startSec":null},{"text":"வாழ்க்கையின் நோக்கமும் புரியும்","startSec":null},{"text":"அண்ணாமலையானின் பேரருளும் கிடைக்கும்","startSec":null},{"text":"வாழ்வினில் ஒருமுறையேனும்","startSec":null},{"text":"அந்த மலையை சுற்றிவர வேண்டும்","startSec":null},{"text":"வாழ்க்கையின் நோக்கமும் புரியும்","startSec":null},{"text":"அண்ணாமலையானின் பேரருளும் கிடைக்கும்","startSec":null}]$lyr$::jsonb, false)
on conflict (track_id, lang) do update
  set lines = excluded.lines, synced = excluded.synced;

-- ---------------------------------------------------------------------------
-- Verification — expect: 3 published tracks, 3 published albums,
-- 3 lyrics rows (Malaiyoram synced, Marakka + Vaazhvinil unsynced).
-- ---------------------------------------------------------------------------
select slug, title_en, composer, genre, duration_sec, status,
       audio_320_url, cover_url
from public.tracks where status = 'published' order by created_at;

select track_id, lang, synced, jsonb_array_length(lines) as line_count
from public.lyrics order by track_id;
