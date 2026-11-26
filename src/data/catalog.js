/**
 * Nandha Music — catalog data layer (local / demo source of truth).
 *
 * REAL DATA ONLY. There is ONE real track: 'Vaazhvinil Orumurayenum'
 * (release 2026-12-10), one real album ('Annamalaiyar'), two real
 * artists (Nandha Music, Siddha Guruji) and one real playlist
 * ('Best of Nandha', containing only the real track).
 *
 * NOTE (26 Nov 2026, user instruction: "don't hide dummy data, only
 * real data"): the 199 sample tracks, sample albums/artists/playlists
 * and every `isSample` flag that used to live in this file were
 * DELETED, not hidden. Do not re-add placeholder content here — new
 * songs come from the admin panel / Supabase, never from generators.
 *
 * When Supabase is configured, the app layer queries the `tracks` /
 * `albums` / `artists` / `playlists` tables (see
 * supabase/migrations/001_schema.sql) and uses this file only as the
 * demo-mode fallback. The shapes here mirror those tables.
 */

// ---------------------------------------------------------------------------
// The ONE real track
// ---------------------------------------------------------------------------
export const REAL_TRACK_ID = 'vaazhvinil-orumurayenum';

const realTrack = {
  id: REAL_TRACK_ID,
  titleTa: 'வாழ்வினில் ஒருமுறையேனும்',
  titleEn: 'Vaazhvinil Orumurayenum',
  artist: 'Nandha Music',
  artistId: 'nandha-music',
  composer: 'Siddha Guruji',
  album: 'Annamalaiyar',
  albumId: 'annamalaiyar',
  genre: 'Devotional',
  language: 'Tamil',
  durationSec: 224,
  cover: '/assets/vaazhvinil-cover-800.webp',
  audio128: '/assets/vaazhvinil-orumurayenum.mp3',
  audio320: '/assets/vaazhvinil-orumurayenum.mp3',
  status: 'published',
  // Plays are counted from real play events only. The song releases
  // 10 Dec 2026, so the count starts at 0 — never a made-up number
  // (26 Nov 2026: fake-play-count cleanup).
  plays: 0,
  releaseDate: '2026-12-10',
  // Discover-feed hook: the opening 30 seconds carry the hook line.
  hookStartSec: 0,
  hookDurationSec: 30,
  // About the Song — shown in the player story card (Tamil + English).
  storyTa: 'திருவண்ணாமலை கிரிவலம் பற்றிய பாடல். வாழ்வில் ஒருமுறையேனும் அண்ணாமலை மலையைச் சுற்றி வர வேண்டும் என்ற பக்தியின் குரல்.',
  storyEn: 'A song about the Girivalam at Thiruvannamalai — the devotee’s wish to walk around the sacred Arunachala hill at least once in this life.',
  storyCredit: 'Composer & writer: Siddha Guruji',
  // Opening lines of the song (the full lyrics are added by the admin
  // once the release is live).
  lyricsTa: [
    'அண்ணாமலையாரே அருள் தாரும்',
    'கிரிவலம் வரும் அடியார் மனம் மகிழும்',
    'அருணாசல ஜோதியே ஒளி தாரும்',
    'வாழ்வினில் ஒருமுறையேனும் உன் தரிசனம்',
  ],
  lyricsEn: [
    'Annamalaiyar, bestow your grace',
    'The devotees walking Girivalam rejoice',
    'Arunachala flame, grant us light',
    'At least once in this life, grant us your darshan',
  ],
};

// ---------------------------------------------------------------------------
// Artists — real only
// ---------------------------------------------------------------------------
export const artists = [
  {
    id: 'nandha-music',
    name: 'Nandha Music',
    nameTa: 'நந்தா மியூசிக்',
    bioEn:
      'Official Tamil music label — love, devotional and melody songs.',
    bioTa: 'அதிகாரப்பூர்வ தமிழ் இசை நிறுவனம் — காதல், பக்தி மற்றும் மெலடி பாடல்கள்.',
    socials: {
      spotify: 'https://open.spotify.com/artist/nandha-music',
      youtube: 'https://youtube.com/@officialnandhamusic',
      instagram: 'https://www.instagram.com/nandhamusic.official/',
      facebook: 'https://www.facebook.com/profile.php?id=61596981507074',
      threads: 'https://www.threads.com/@officialnandhamusic',
    },
  },
  {
    id: 'siddha-guruji',
    name: 'Siddha Guruji',
    nameTa: 'சித்த குருஜி',
    bioEn: 'Composer and writer for Nandha Music songs.',
    bioTa: 'நந்தா மியூசிக் பாடல்களின் இசையமைப்பாளர் மற்றும் பாடலாசிரியர்.',
    socials: {},
  },
];

// ---------------------------------------------------------------------------
// Albums — real only
// ---------------------------------------------------------------------------
export const albums = [
  {
    id: 'annamalaiyar',
    titleEn: 'Annamalaiyar',
    titleTa: 'அண்ணாமலையார்',
    artist: 'Nandha Music',
    artistId: 'nandha-music',
    genre: 'Devotional',
    cover: '/assets/vaazhvinil-cover-800.webp',
    releaseDate: '2026-12-10',
  },
];

// ---------------------------------------------------------------------------
// Tracks — the ONE real track only
// ---------------------------------------------------------------------------
export const tracks = [realTrack];

// ---------------------------------------------------------------------------
// Playlists — real only (lists containing the real track)
// ---------------------------------------------------------------------------
export const playlists = [
  {
    id: 'best-of-nandha',
    title: 'Best of Nandha',
    titleEn: 'Best of Nandha',
    titleTa: 'நந்தாவின் சிறந்தவை',
    descriptionEn: 'The best of Nandha Music — starting with Vaazhvinil Orumurayenum.',
    descriptionTa: 'நந்தா மியூசிக்கின் சிறந்த பாடல்கள்.',
    cover: '/assets/vaazhvinil-cover-800.webp',
    trackIds: [REAL_TRACK_ID],
  },
];

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
const trackById = new Map(tracks.map((t) => [t.id, t]));

export function getTrack(id) {
  return trackById.get(id) ?? null;
}

// ---------------------------------------------------------------------------
// Search — case-insensitive Tamil + English title / artist / album.
// Listener-facing: published tracks only. 20-result cap.
// ---------------------------------------------------------------------------
export function searchTracks(query, { limit = 20 } = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [];
  const results = [];
  for (const t of tracks) {
    if (t.status !== 'published') continue;
    const haystack = `${t.titleTa} ${t.titleEn} ${t.artist} ${t.album} ${t.genre}`.toLowerCase();
    if (haystack.includes(q)) {
      results.push(t);
      if (results.length >= limit) break;
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Time-of-day home + Daily Mix + Song of the Day (rule-based, no AI/ML).
// Daypart windows: Morning 05–10 Devotional/Aarti, Afternoon 10–18 Melody,
// Evening 18–21 Love, Night 21–05 Calm (Melody/Devotional, low plays first).
// ---------------------------------------------------------------------------
export function getDaypart(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 10) return { key: 'morning', labelEn: 'Morning Devotional', labelTa: 'காலை பக்தி', genres: ['Devotional', 'Sivan', 'Siddhar'] };
  if (h >= 10 && h < 18) return { key: 'afternoon', labelEn: 'Afternoon Melody', labelTa: 'மதிய மெலடி', genres: ['Melody'] };
  if (h >= 18 && h < 21) return { key: 'evening', labelEn: 'Evening Love', labelTa: 'மாலை காதல்', genres: ['Love'] };
  return { key: 'night', labelEn: 'Night Calm', labelTa: 'இரவு அமைதி', genres: ['Melody', 'Devotional'] };
}

// Song of the Day: one devotional track per calendar day, deterministic.
// Admin override (localStorage 'nandha-song-of-day') wins when set for today.
export function getSongOfTheDay(date = new Date()) {
  try {
    const override = JSON.parse(localStorage.getItem('nandha-song-of-day') || 'null');
    if (override && override.date === date.toDateString()) {
      const t = getTrack(override.trackId);
      if (t) return t;
    }
  } catch { /* ignore */ }
  const devotionals = tracks.filter((t) => t.status === 'published' && t.genre === 'Devotional');
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
  return devotionals[dayOfYear % devotionals.length] || realTrack;
}

