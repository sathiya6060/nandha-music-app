"""Generate the pending seed SQL for Malaiyoram + Marakka + Vaazhvinil lyrics.

Reads the three lyrics line-sets (Malaiyoram synced from word timestamps;
Vaazhvinil + Marakka unsynced from Sathiya's verified text files) and writes
supabase/seed-malaiyoram-marakka-vaazhvinil-lyrics-2026-11-27-PENDING.sql.

The SQL is NOT applied by this script — it runs in the Supabase SQL Editor
(Sathiya/dashboard step) after the mp3s + covers are uploaded to Storage.
"""
import json, re

WS = "/home/hatch/workspace"
APP = f"{WS}/nandha-music-app"

def parse_verified(path, skip_headers=2):
    lines = []
    with open(path, encoding="utf-8") as f:
        raw = [re.sub(r"\s+", " ", ln).strip() for ln in f]
    for ln in raw[skip_headers:]:
        if ln:
            lines.append(ln)
    return lines

# --- Malaiyoram: synced, from word timestamps ---
with open(f"{WS}/instagram/reels/malaiyoram-tomorrow/malaiyoram-lyrics-lines.json",
          encoding="utf-8") as f:
    mal_lines = json.load(f)
assert len(mal_lines) == 32, len(mal_lines)
assert all(isinstance(l["startSec"], (int, float)) for l in mal_lines)

# --- Vaazhvinil: unsynced, verified text ---
va_text = parse_verified(f"{WS}/instagram/lyrics/vaazhvinil-orumurayenum-lyrics-verified.txt")
assert len(va_text) == 40, len(va_text)
va_lines = [{"text": t, "startSec": None} for t in va_text]

# --- Marakka: unsynced, verified text (incl. humming lines) ---
ma_text = parse_verified(f"{WS}/instagram/lyrics/marakka-mudiyuma-lyrics-verified.txt")
assert len(ma_text) == 32, len(ma_text)
ma_lines = [{"text": t, "startSec": None} for t in ma_text]

def sql_json(lines):
    return json.dumps(lines, ensure_ascii=False, separators=(",", ":"))

SUPABASE_URL = "https://qldhyzgpxuzpsymongvf.supabase.co"
ARTIST_NANDHA = "24f966e7-6182-4ee9-aab8-668b64ff96c0"
TRACK_VAAZHVINIL = "485b5cdc-0a86-4501-be2d-90b64a3a3657"
MAL_COVER = f"{SUPABASE_URL}/storage/v1/object/public/covers/malaiyoram-veesiya-kaatre-cover-800.jpg"
MAR_COVER = f"{SUPABASE_URL}/storage/v1/object/public/covers/marakka-mudiyuma-cover-800.jpg"

sql = f"""-- ============================================================================
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
     '{ARTIST_NANDHA}', 'Love', '{MAL_COVER}', null, 'published')
  returning id
), track as (
  insert into public.tracks
    (slug, title_en, title_ta, artist_id, album_id, composer, lyricist,
     genre, language, duration_sec, audio_128_url, audio_320_url, cover_url,
     status, release_date, hook_start_sec, hook_duration_sec)
  select
    'malaiyoram-veesiya-kaatre', 'Malaiyoram Veesiya Kaatre',
    'மலையோரம் வீசிய காற்றே',
    '{ARTIST_NANDHA}', album.id, null, null,
    'Love', 'Tamil', 351,
    'audio/malaiyoram-veesiya-kaatre.mp3',
    'audio/malaiyoram-veesiya-kaatre.mp3',
    '{MAL_COVER}',
    'published', null, 63, 12
  from album
  returning id
)
insert into public.lyrics (track_id, lang, lines, synced)
select id, 'ta', $lyr${sql_json(mal_lines)}$lyr$::jsonb, true
from track;

-- ---------------------------------------------------------------------------
-- Marakka Mudiyuma — album + track + unsynced lyrics
-- ---------------------------------------------------------------------------
with album as (
  insert into public.albums
    (title_en, title_ta, artist_id, genre, cover_url, release_date, status)
  values
    ('Marakka Mudiyuma', 'மறக்க முடியுமா?',
     '{ARTIST_NANDHA}', 'Love', '{MAR_COVER}', null, 'published')
  returning id
), track as (
  insert into public.tracks
    (slug, title_en, title_ta, artist_id, album_id, composer, lyricist,
     genre, language, duration_sec, audio_128_url, audio_320_url, cover_url,
     status, release_date, hook_start_sec, hook_duration_sec)
  select
    'marakka-mudiyuma', 'Marakka Mudiyuma', 'மறக்க முடியுமா?',
    '{ARTIST_NANDHA}', album.id, 'Siddha Guruji', null,
    'Love', 'Tamil', 254,
    'audio/marakka-mudiyuma.mp3',
    'audio/marakka-mudiyuma.mp3',
    '{MAR_COVER}',
    'published', null, null, null
  from album
  returning id
)
insert into public.lyrics (track_id, lang, lines, synced)
select id, 'ta', $lyr${sql_json(ma_lines)}$lyr$::jsonb, false
from track;

-- ---------------------------------------------------------------------------
-- Vaazhvinil Orumurayenum — real lyrics (replaces the 4 sample lines).
-- Audio row is NOT touched. Idempotent: re-running updates the same row.
-- ---------------------------------------------------------------------------
insert into public.lyrics (track_id, lang, lines, synced)
values
  ('{TRACK_VAAZHVINIL}', 'ta', $lyr${sql_json(va_lines)}$lyr$::jsonb, false)
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
"""

out = f"{APP}/supabase/seed-malaiyoram-marakka-vaazhvinil-lyrics-2026-11-27-PENDING.sql"
with open(out, "w", encoding="utf-8") as f:
    f.write(sql)
print("wrote", out, f"({len(sql)} bytes)")
print("Malaiyoram lines:", len(mal_lines), "synced")
print("Vaazhvinil lines:", len(va_lines), "unsynced")
print("Marakka lines:", len(ma_lines), "unsynced")
