/**
 * Nandha Music — catalog data layer (local / demo source of truth).
 *
 * ONE real track only: 'Vaazhvinil Orumurayenum' (release 2026-12-10).
 * Everything else is CLEARLY MARKED sample data (`isSample: true`,
 * titleEn 'Sample Track N — Coming Soon', audio URLs null) so the UI can
 * never mistake a placeholder for a real song. Sample tracks are generated
 * deterministically at module load from a fixed seed — no Math.random(),
 * no Date.now() — so the catalog is identical on every load.
 *
 * When Supabase is configured, the app layer queries the `tracks` /
 * `albums` / `artists` / `playlists` tables (see
 * supabase/migrations/001_schema.sql) and uses this file only as the
 * demo-mode fallback. The shapes here mirror those tables.
 */

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32, fixed seed) — no randomness at runtime.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261126);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const intBetween = (min, max) => min + Math.floor(rand() * (max - min + 1));

// ---------------------------------------------------------------------------
// The ONE real track
// ---------------------------------------------------------------------------
export const REAL_TRACK_ID = 'vaazhvinil-orumurayenum';

export const realTrack = {
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
  cover: '/assets/vaazhvinil-cover.jpg',
  audio128: '/assets/vaazhvinil-orumurayenum.mp3',
  audio320: '/assets/vaazhvinil-orumurayenum.mp3',
  status: 'published',
  plays: 1250,
  isSample: false,
  releaseDate: '2026-12-10',
  // Discover-feed hook: the opening 30 seconds carry the hook line.
  hookStartSec: 0,
  hookDurationSec: 30,
  // About the Song — shown in the player story card (Tamil + English).
  storyTa: 'திருவண்ணாமலை கிரிவலம் பற்றிய பாடல். வாழ்வில் ஒருமுறையேனும் அண்ணாமலை மலையைச் சுற்றி வர வேண்டும் என்ற பக்தியின் குரல்.',
  storyEn: 'A song about the Girivalam at Thiruvannamalai — the devotee’s wish to walk around the sacred Arunachala hill at least once in this life.',
  storyCredit: 'Composer & writer: Siddha Guruji',
  /**
   * SAMPLE LINES ONLY — 4 short generic devotional lines on the
   * Girivalam / Annamalaiyar theme, NOT the song's full lyrics.
   * Real lyrics are added by the admin once the release is live.
   */
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
  isSampleLyrics: true,
};

// ---------------------------------------------------------------------------
// Artists (2 real + 4 sample)
// ---------------------------------------------------------------------------
export const artists = [
  {
    id: 'nandha-music',
    name: 'Nandha Music',
    nameTa: 'நந்தா மியூசிக்',
    bioEn:
      'Official Tamil music label — love, devotional and melody songs. New song every week.',
    bioTa: 'அதிகாரப்பூர்வ தமிழ் இசை நிறுவனம் — காதல், பக்தி மற்றும் மெலடி பாடல்கள். ஒவ்வொரு வாரமும் புதிய பாடல்.',
    isSample: false,
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
    isSample: false,
    socials: {},
  },
  {
    id: 'sample-artist-1',
    name: 'Sample Artist 1',
    nameTa: 'மாதிரி கலைஞர் 1',
    bioEn: 'Sample artist — placeholder for the catalog demo.',
    bioTa: 'மாதிரி கலைஞர் — பட்டியல் மாதிரிக்கான இடம்.',
    isSample: true,
    socials: {},
  },
  {
    id: 'sample-artist-2',
    name: 'Sample Artist 2',
    nameTa: 'மாதிரி கலைஞர் 2',
    bioEn: 'Sample artist — placeholder for the catalog demo.',
    bioTa: 'மாதிரி கலைஞர் — பட்டியல் மாதிரிக்கான இடம்.',
    isSample: true,
    socials: {},
  },
  {
    id: 'sample-artist-3',
    name: 'Sample Artist 3',
    nameTa: 'மாதிரி கலைஞர் 3',
    bioEn: 'Sample artist — placeholder for the catalog demo.',
    bioTa: 'மாதிரி கலைஞர் — பட்டியல் மாதிரிக்கான இடம்.',
    isSample: true,
    socials: {},
  },
  {
    id: 'sample-artist-4',
    name: 'Sample Artist 4',
    nameTa: 'மாதிரி கலைஞர் 4',
    bioEn: 'Sample artist — placeholder for the catalog demo.',
    bioTa: 'மாதிரி கலைஞர் — பட்டியல் மாதிரிக்கான இடம்.',
    isSample: true,
    socials: {},
  },
];

// ---------------------------------------------------------------------------
// Albums (1 real + 11 sample)
// ---------------------------------------------------------------------------
const SAMPLE_ALBUM_DEFS = [
  { id: 'sivan-songs-vol-1', titleEn: 'Sivan Songs Vol. 1', titleTa: 'சிவன் பாடல்கள் தொகுதி 1', genre: 'Sivan' },
  { id: 'sivan-songs-vol-2', titleEn: 'Sivan Songs Vol. 2', titleTa: 'சிவன் பாடல்கள் தொகுதி 2', genre: 'Sivan' },
  { id: 'siddhar-songs', titleEn: 'Siddhar Songs', titleTa: 'சித்தர் பாடல்கள்', genre: 'Siddhar' },
  { id: 'nandeeswarar-songs', titleEn: 'Nandeeswarar Songs', titleTa: 'நந்தீஸ்வரர் பாடல்கள்', genre: 'Siddhar' },
  { id: 'love-melodies-vol-1', titleEn: 'Love Melodies Vol. 1', titleTa: 'காதல் மெலடிகள் தொகுதி 1', genre: 'Love' },
  { id: 'love-melodies-vol-2', titleEn: 'Love Melodies Vol. 2', titleTa: 'காதல் மெலடிகள் தொகுதி 2', genre: 'Love' },
  { id: 'melody-classics', titleEn: 'Melody Classics', titleTa: 'மெலடி பாடல்கள்', genre: 'Melody' },
  { id: 'devotional-morning', titleEn: 'Devotional Morning', titleTa: 'பக்தி காலை', genre: 'Devotional' },
  { id: 'girivalam-songs', titleEn: 'Girivalam Songs', titleTa: 'கிரிவலம் பாடல்கள்', genre: 'Devotional' },
  { id: 'melody-nights', titleEn: 'Melody Nights', titleTa: 'மெலடி இரவுகள்', genre: 'Melody' },
  { id: 'love-and-longing', titleEn: 'Love and Longing', titleTa: 'காதலும் ஏக்கமும்', genre: 'Love' },
];

export const albums = [
  {
    id: 'annamalaiyar',
    titleEn: 'Annamalaiyar',
    titleTa: 'அண்ணாமலையார்',
    artist: 'Nandha Music',
    artistId: 'nandha-music',
    genre: 'Devotional',
    cover: '/assets/vaazhvinil-cover.jpg',
    releaseDate: '2026-12-10',
    isSample: false,
  },
  ...SAMPLE_ALBUM_DEFS.map((def, i) => ({
    id: def.id,
    titleEn: def.titleEn,
    titleTa: def.titleTa,
    artist: pick(['Nandha Music', 'Siddha Guruji']),
    artistId: pick(['nandha-music', 'siddha-guruji']),
    genre: def.genre,
    // Sample albums have no cover art — UI shows a brand-coloured placeholder.
    cover: null,
    releaseDate: `2025-${String(intBetween(1, 12)).padStart(2, '0')}-${String(intBetween(1, 28)).padStart(2, '0')}`,
    isSample: true,
    _order: i,
  })),
];

// ---------------------------------------------------------------------------
// Sample tracks — 199, deterministic
// ---------------------------------------------------------------------------
const SAMPLE_ARTISTS = [
  { artist: 'Nandha Music', artistId: 'nandha-music' },
  { artist: 'Siddha Guruji', artistId: 'siddha-guruji' },
  { artist: 'Sample Artist 1', artistId: 'sample-artist-1' },
  { artist: 'Sample Artist 2', artistId: 'sample-artist-2' },
  { artist: 'Sample Artist 3', artistId: 'sample-artist-3' },
  { artist: 'Sample Artist 4', artistId: 'sample-artist-4' },
];
const GENRES = ['Devotional', 'Love', 'Melody', 'Siddhar', 'Sivan'];

function buildSampleTracks() {
  const list = [];
  for (let n = 1; n <= 199; n += 1) {
    const album = SAMPLE_ALBUM_DEFS[(n - 1) % SAMPLE_ALBUM_DEFS.length];
    const who = SAMPLE_ARTISTS[(n - 1) % SAMPLE_ARTISTS.length];
    // Genre follows the album most of the time, so album pages feel coherent.
    const genre = n % 4 === 0 ? pick(GENRES) : album.genre;
    // A few admin-demo rows are not published yet.
    const status = n % 47 === 0 ? 'draft' : n % 53 === 0 ? 'scheduled' : 'published';
    list.push({
      id: `sample-track-${n}`,
      titleTa: `மாதிரி பாடல் ${n}`,
      titleEn: `Sample Track ${n} — Coming Soon`,
      artist: who.artist,
      artistId: who.artistId,
      composer: 'Siddha Guruji',
      album: album.titleEn,
      albumId: album.id,
      genre,
      language: 'Tamil',
      durationSec: intBetween(150, 280),
      // Sample tracks have NO cover and NO audio — UI shows a placeholder
      // and disables playback. Only the real track reuses its cover.
      cover: null,
      audio128: null,
      audio320: null,
      status,
      plays: intBetween(0, 900),
      isSample: true,
      releaseDate: `2025-${String(intBetween(1, 12)).padStart(2, '0')}-${String(intBetween(1, 28)).padStart(2, '0')}`,
      lyricsTa: [],
      lyricsEn: [],
      isSampleLyrics: true,
      hookStartSec: 0,
      hookDurationSec: 30,
      storyTa: '',
      storyEn: '',
      storyCredit: '',
    });
  }
  return list;
}

export const sampleTracks = buildSampleTracks();

/** All 200 tracks: the 1 real track first, then the 199 samples. */
export const tracks = [realTrack, ...sampleTracks];

// ---------------------------------------------------------------------------
// Playlists (3 curated, ordered track-id arrays)
// ---------------------------------------------------------------------------
const sivanTrackIds = tracks
  .filter((t) => t.genre === 'Sivan' || t.genre === 'Siddhar')
  .slice(0, 20)
  .map((t) => t.id);
const loveTrackIds = tracks
  .filter((t) => t.genre === 'Love' || t.genre === 'Melody')
  .slice(0, 20)
  .map((t) => t.id);

export const playlists = [
  {
    id: 'best-of-nandha',
    titleEn: 'Best of Nandha',
    titleTa: 'நந்தாவின் சிறந்தவை',
    descriptionEn: 'The best of Nandha Music — starting with Vaazhvinil Orumurayenum.',
    descriptionTa: 'நந்தா மியூசிக்கின் சிறந்த பாடல்கள்.',
    cover: '/assets/vaazhvinil-cover.jpg',
    isSample: false,
    trackIds: [REAL_TRACK_ID, ...sampleTracks.slice(0, 14).map((t) => t.id)],
  },
  {
    id: 'sivan-songs',
    titleEn: 'Sivan Songs',
    titleTa: 'சிவன் பாடல்கள்',
    descriptionEn: 'Devotional songs for Lord Shiva, Siddhar and Nandeeswarar.',
    descriptionTa: 'சிவன், சித்தர், நந்தீஸ்வரர் பக்தி பாடல்கள்.',
    cover: null,
    isSample: true,
    trackIds: sivanTrackIds,
  },
  {
    id: 'love-melodies',
    titleEn: 'Love Melodies',
    titleTa: 'காதல் மெலடிகள்',
    descriptionEn: 'Love and melody songs for quiet evenings.',
    descriptionTa: 'காதல் மற்றும் மெலடி பாடல்கள்.',
    cover: null,
    isSample: true,
    trackIds: loveTrackIds,
  },
];

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
const trackById = new Map(tracks.map((t) => [t.id, t]));
const albumById = new Map(albums.map((a) => [a.id, a]));
const artistById = new Map(artists.map((a) => [a.id, a]));
const playlistById = new Map(playlists.map((p) => [p.id, p]));

export function getTrack(id) {
  return trackById.get(id) ?? null;
}

export function getAlbum(id) {
  return albumById.get(id) ?? null;
}

export function getArtist(id) {
  return artistById.get(id) ?? null;
}

export function getPlaylist(id) {
  return playlistById.get(id) ?? null;
}

export function getAlbumTracks(albumId) {
  return tracks.filter((t) => t.albumId === albumId);
}

export function getArtistTracks(artistId) {
  return tracks.filter((t) => t.artistId === artistId);
}

export function getPlaylistTracks(playlistId) {
  const playlist = playlistById.get(playlistId);
  if (!playlist) return [];
  return playlist.trackIds.map((id) => trackById.get(id)).filter(Boolean);
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
// Debounce — 300 ms. `debouncedSearch(query, callback)` searches after the
// user stops typing; `createDebounced(fn, delay)` is the generic helper.
// ---------------------------------------------------------------------------
export function createDebounced(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  };
}

export const debouncedSearch = createDebounced((query, callback) => {
  callback(searchTracks(query));
}, 300);

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

export function getDaypartTracks(date = new Date(), limit = 20) {
  const part = getDaypart(date);
  const pool = tracks.filter((t) => t.status === 'published' && part.genres.includes(t.genre));
  return pool.slice(0, limit);
}

// Rule-based Daily Mix: rotates by day-of-year, seeded — same mix all day,
// different mix tomorrow. Real track first when it matches the seed window.
export function getDailyMix(date = new Date(), limit = 20) {
  const published = tracks.filter((t) => t.status === 'published');
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
  const rand = mulberry32(dayOfYear * 7919 + 13);
  const pool = [...published];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const mix = pool.slice(0, limit);
  if (!mix.some((t) => t.id === REAL_TRACK_ID)) mix[0] = realTrack;
  return mix;
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

export default tracks;
