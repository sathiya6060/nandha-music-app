/**
 * Nandha Music — app configuration.
 *
 * Env-based only. NO credentials are hard-coded here (or anywhere in the
 * app). All secrets live in environment variables:
 *
 *   VITE_SUPABASE_URL               Supabase project URL
 *   VITE_SUPABASE_ANON_KEY          Supabase publishable (anon) key
 *   VITE_AUDIO_BASE_URL             Cloudflare R2 public base URL for audio
 *                                   e.g. https://audio.nandhamusic.example
 *   VITE_UPSTASH_REDIS_REST_URL     Upstash Redis REST URL (optional)
 *   VITE_UPSTASH_REDIS_REST_TOKEN   Upstash Redis REST token (optional)
 *                                   — READ-ONLY token only (see
 *                                   src/lib/redisGuard.js). The
 *                                   full-access token lives ONLY in the
 *                                   redis-cache Edge Function env.
 *   VITE_REDIS_MONTHLY_BUDGET       Redis command budget/month, default
 *                                   450000 (90% of the 500K free tier).
 *   VITE_DEMO_MODE                  'true' = demo mode (see below).
 *
 * DEMO MODE (26 Nov 2026, OpenCodeReview M2): demo mode runs ONLY when
 * the explicit VITE_DEMO_MODE=true flag is set. Missing Supabase URL/key
 * alone does NOT enable demo mode — without Supabase and without the
 * flag the app is misconfigured and sign-in fails closed (see
 * src/lib/auth.jsx). In demo mode the role is always 'listener'; admin
 * is never granted (the allowlist does not apply in demo).
 * Copy `.env.example` (when present) to `.env.local` and fill in values.
 */

const env = import.meta.env ?? {};

function readEnv(name) {
  const fromImportMeta = env[name];
  if (typeof fromImportMeta === 'string' && fromImportMeta.trim() !== '') {
    return fromImportMeta.trim();
  }
  // Node test harness only (mobile-verify/test-redis-guard.mjs): the
  // browser build never has process.env.
  if (typeof process !== 'undefined' && process?.env?.[name]) {
    const v = process.env[name];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return '';
}

/** Monthly Redis command budget; invalid/missing -> 450,000 (90% of free). */
function parseBudget(raw) {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 450_000;
}

export const config = {
  supabaseUrl: readEnv('VITE_SUPABASE_URL'),
  supabaseAnonKey: readEnv('VITE_SUPABASE_ANON_KEY'),
  /** Cloudflare R2 public base URL for audio files (no trailing slash). */
  audioBaseUrl: readEnv('VITE_AUDIO_BASE_URL').replace(/\/+$/, ''),
  upstashRedisUrl: readEnv('VITE_UPSTASH_REDIS_REST_URL').replace(/\/+$/, ''),
  upstashRedisToken: readEnv('VITE_UPSTASH_REDIS_REST_TOKEN'),
  /** Monthly Redis command budget (redisGuard.js). Default 450,000. */
  redisMonthlyBudget: parseBudget(readEnv('VITE_REDIS_MONTHLY_BUDGET')),
  /** Explicit demo-mode flag (M2): only 'true' enables demo mode. */
  demoMode: readEnv('VITE_DEMO_MODE').toLowerCase() === 'true',
};

/**
 * True ONLY when the explicit VITE_DEMO_MODE=true flag is set (M2).
 * Missing Supabase vars alone do NOT enable demo mode — without
 * Supabase and without the flag, the app is misconfigured and auth
 * fails closed (see src/lib/auth.jsx). The catalog in
 * src/data/catalog.js is still the local data source in demo.
 */
export const isDemoMode = config.demoMode === true;

export const isRedisConfigured =
  config.upstashRedisUrl !== '' && config.upstashRedisToken !== '';
const isR2Configured = config.audioBaseUrl !== '';

/**
 * Resolve the playable audio URL for a track.
 *
 * @param {object} track   Catalog track ({ audio128, audio320 }).
 * @param {'128'|'320'} [quality='128']  '128' = default / mobile data,
 *   '320' = Wi-Fi / high quality.
 * @returns {string|null} URL to play, or null when the track has no audio
 *   (sample / coming-soon tracks have audio128/audio320 === null).
 *
 * R2 layout (when VITE_AUDIO_BASE_URL is set): files are stored flat under
 * the base URL by file name, e.g.
 *   <base>/vaazhvinil-orumurayenum.mp3
 * The local/demo path stored on the track (e.g. '/assets/….mp3') is reduced
 * to its file name for the R2 URL. Without R2, the track's local path is
 * returned as-is (served from /public/assets in dev/demo).
 */
export function audioUrl(track, quality = '128') {
  if (!track) return null;
  const localPath = quality === '320' ? track.audio320 : track.audio128;
  if (!localPath) return null;
  if (!isR2Configured) return localPath;
  const fileName = String(localPath).split('/').filter(Boolean).pop();
  return `${config.audioBaseUrl}/${fileName}`;
}

