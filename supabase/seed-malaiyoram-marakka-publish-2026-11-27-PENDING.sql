-- ============================================================================
-- Nandha Music — PUBLISH the two admin-created draft tracks + lyrics
-- *** PENDING — NOT APPLIED. Run in the Supabase SQL Editor (dashboard). ***
-- Prepared 27 Nov 2026 19:45 IST. Supersedes (for the track/album rows)
-- seed-malaiyoram-marakka-vaazhvinil-lyrics-2026-11-27-PENDING.sql — do NOT
-- run that file afterwards: it INSERTs the same slugs and will fail on the
-- slug unique constraint.
--
-- WHY THIS FILE: the admin panel already created both tracks as DRAFTS
-- (slugs malaiyoram-veesiya-kaatre, marakka-mudiyuma) with their albums,
-- but the admin file-upload approval prompts never reached Sathiya (9
-- attempts, all declined automatically, no card ever visible), so no
-- audio/cover could be attached and the form refuses to publish without
-- audio ("Add an audio file before publishing"). The 4 files are ALREADY
-- in Storage (dashboard upload 27 Nov 2026 19:35 IST, sizes verified).
-- This script attaches those existing files to the draft rows, publishes
-- them, fixes the Marakka hook defaults the form stored (0/30 — plan is
-- NULL), and inserts all 3 lyrics sets. Safe to re-run (UPDATEs + lyrics
-- ON CONFLICT upserts).
--
-- Covers: the NEW orange-N logo versions (27 Nov 2026 19:26 IST), same
-- filenames as the original seed references.
-- Composer flags (unchanged): Malaiyoram composer NULL (no credit found —
-- do NOT assume Siddha Guruji); Marakka 'Siddha Guruji' per RouteNote/
-- Spotify, poster credits everything to NANDHA — Sathiya to confirm.
-- ============================================================================

-- Malaiyoram Veesiya Kaatre — attach audio + new-logo cover, publish.
update public.tracks
set audio_128_url = 'audio/malaiyoram-veesiya-kaatre.mp3',
    audio_320_url = 'audio/malaiyoram-veesiya-kaatre.mp3',
    cover_url = 'https://qldhyzgpxuzpsymongvf.supabase.co/storage/v1/object/public/covers/malaiyoram-veesiya-kaatre-cover-800.jpg',
    duration_sec = 351,
    status = 'published',
    hook_start_sec = 63,
    hook_duration_sec = 12
where slug = 'malaiyoram-veesiya-kaatre';

-- Marakka Mudiyuma — attach audio + new-logo cover, publish, hook to NULL.
update public.tracks
set audio_128_url = 'audio/marakka-mudiyuma.mp3',
    audio_320_url = 'audio/marakka-mudiyuma.mp3',
    cover_url = 'https://qldhyzgpxuzpsymongvf.supabase.co/storage/v1/object/public/covers/marakka-mudiyuma-cover-800.jpg',
    duration_sec = 254,
    status = 'published',
    hook_start_sec = null,
    hook_duration_sec = null
where slug = 'marakka-mudiyuma';

-- Albums (created by the admin) — set the new-logo cover + publish.
update public.albums
set cover_url = 'https://qldhyzgpxuzpsymongvf.supabase.co/storage/v1/object/public/covers/malaiyoram-veesiya-kaatre-cover-800.jpg',
    status = 'published'
where id = (select album_id from public.tracks where slug = 'malaiyoram-veesiya-kaatre');

update public.albums
set cover_url = 'https://qldhyzgpxuzpsymongvf.supabase.co/storage/v1/object/public/covers/marakka-mudiyuma-cover-800.jpg',
    status = 'published'
where id = (select album_id from public.tracks where slug = 'marakka-mudiyuma');

-- ---------------------------------------------------------------------------
-- Malaiyoram lyrics — 32 SYNCED lines (verified text + Whisper timestamps).
-- ---------------------------------------------------------------------------
insert into public.lyrics (track_id, lang, lines, synced)
select id, 'ta', $lyr$[{"text":"மலையோரம் வீசிய காற்றே - காவேரி","startSec":32.56},{"text":"கரையோரம் வீசிட வாவா","startSec":38.48},{"text":"மடலோரம் தூறிய பனியே - என்","startSec":47.8},{"text":"மனதோரம் பெய்திட வாவா","startSec":53.02},{"text":"மலையோரம் வீசிய காற்றே - காவேரி","startSec":63.0},{"text":"கரையோரம் வீசிட வாவா","startSec":70.82},{"text":"மடலோரம் தூறிய பனியே - என்","startSec":78.22},{"text":"மனதோரம் பெய்திட வாவா","startSec":83.86},{"text":"ஏழு ஜென்ம பந்தமென்ற ஒன்றுண்டு","startSec":93.56},{"text":"என் அருகில் வந்தால் அறிவதற்கு வாய்ப்புண்டு","startSec":99.52},{"text":"ஏழு ஜென்ம பந்தமென்ற ஒன்றுண்டு","startSec":108.28},{"text":"என் அருகில் வந்தால் அறிவதற்கு வாய்ப்புண்டு","startSec":114.54},{"text":"தூரத்தில் இருந்தென்ன பலனுண்டு - நான்","startSec":126.34},{"text":"தொட்டாலே நீ மலர இடமுண்டு","startSec":131.7},{"text":"தூரத்தில் இருந்தென்ன பலனுண்டு - நான்","startSec":141.58},{"text":"தொட்டாலே நீ மலர இடமுண்டு","startSec":146.96},{"text":"மலையோரம் வீசிய காற்றே - காவேரி","startSec":154.38},{"text":"கரையோரம் வீசிட வாவா","startSec":161.48},{"text":"மடலோரம் தூறிய பனியே - என்","startSec":169.62},{"text":"மனதோரம் பெய்திட வாவா","startSec":177.54},{"text":"அன்பாலே உந்தனிலே நான்பாதி","startSec":218.62},{"text":"அணைத்தாலே என்னோடு நீ ஹாதி","startSec":222.14},{"text":"அன்பாலே உந்தனிலே நான்பாதி","startSec":227.62},{"text":"அணைத்தாலே என்னோடு நீ ஹாதி","startSec":238.4},{"text":"எந்நாளும் எந்தனுக்கு நீ ராசி","startSec":245.54},{"text":"என் இதயம் வீற்றிருக்கும் மகராசி","startSec":247.14},{"text":"எந்நாளும் எந்தனுக்கு நீ ராசி","startSec":261.0},{"text":"என் இதயம் வீற்றிருக்கும் மகராசி","startSec":262.4},{"text":"மலையோரம் வீசிய காற்றே - காவேரி","startSec":276.32},{"text":"கரையோரம் வீசிட வாவா","startSec":284.0},{"text":"மடலோரம் தூறிய பனியே - என்","startSec":291.4},{"text":"மனதோரம் பெய்திட வாவா","startSec":299.92}]$lyr$::jsonb, true
from public.tracks where slug = 'malaiyoram-veesiya-kaatre'
on conflict (track_id, lang) do update
  set lines = excluded.lines, synced = excluded.synced;

-- ---------------------------------------------------------------------------
-- Marakka lyrics — 32 lines, UNSYNCED.
-- ---------------------------------------------------------------------------
insert into public.lyrics (track_id, lang, lines, synced)
select id, 'ta', $lyr$[{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"எங்கு நீ சென்றாலும் மறக்கமுடியுமா","startSec":null},{"text":"என்னை விட்டு உன் நினைவை மாற்றமுடியுமா","startSec":null},{"text":"பெண்ணை விட்டு பேரழகை பிரிக்கமுடியுமா","startSec":null},{"text":"பேச்சை விட்டு ஒலியை தனியே எடுக்கமுடியுமா","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"எங்கு நீ சென்றாலும் மறக்கமுடியுமா","startSec":null},{"text":"என்னை விட்டு உன் நினைவை மாற்றமுடியுமா","startSec":null},{"text":"பெண்ணை விட்டு பேரழகை பிரிக்கமுடியுமா","startSec":null},{"text":"பேச்சை விட்டு ஒலியை தனியே எடுக்கமுடியுமா","startSec":null},{"text":"இணைந்த இரு உள்ளங்கள் பிரிவதுமில்லை","startSec":null},{"text":"இருவரும் காதலிலே தோற்பதுமில்லை","startSec":null},{"text":"அணைத்த இருகரங்கள் விலகுவதில்லை","startSec":null},{"text":"அன்பை அழிக்கும் ஆயுதம் இதுவரை இல்லை","startSec":null},{"text":"ஆஹஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"எங்கு நீ சென்றாலும் மறக்கமுடியுமா","startSec":null},{"text":"என்னை விட்டு உன் நினைவை மாற்றமுடியுமா","startSec":null},{"text":"பெண்ணை விட்டு பேரழகை பிரிக்கமுடியுமா","startSec":null},{"text":"பேச்சை விட்டு ஒலியை தனியே எடுக்கமுடியுமா","startSec":null},{"text":"அன்று உன்னை பார்த்த போது ஓவியமாச்சு","startSec":null},{"text":"அன்பாக பேசியவை காவியமாச்சு","startSec":null},{"text":"இன்று இவையனைத்தும் கனவுபோலாச்சு","startSec":null},{"text":"என் இதயமேடை தனில் ஒரு நாடகமாச்சு","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"ஆஹஹஹஹா ஆஹஹஹஹா","startSec":null},{"text":"எங்கு நீ சென்றாலும் மறக்கமுடியுமா","startSec":null},{"text":"என்னை விட்டு உன் நினைவை மாற்றமுடியுமா","startSec":null},{"text":"பெண்ணை விட்டு பேரழகை பிரிக்கமுடியுமா","startSec":null},{"text":"பேச்சை விட்டு ஒலியை தனியே எடுக்கமுடியுமா","startSec":null}]$lyr$::jsonb, false
from public.tracks where slug = 'marakka-mudiyuma'
on conflict (track_id, lang) do update
  set lines = excluded.lines, synced = excluded.synced;

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
