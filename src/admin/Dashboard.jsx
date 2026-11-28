// Admin dashboard — headline stats (real data only), needs attention,
// recent activity, quick actions.
//
// Metric rules (admin redesign §5): only real data; a metric with no
// data is hidden, never shown as 0. Plays 7d comes from play_events
// (the `play_events: admin read` policy in 001 already allows the
// admin client to read it). Likes/Followers come from liked_tracks /
// followed_artists — both are owner-only until migration 008 adds
// admin-read policies, so until 008 is applied live those queries
// fail and the metrics are hidden (not shown as 0).
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { tracks, albums, artists } from '../data/catalog.js'
import { useTracks, useAlbums, useArtists } from '../lib/supabaseCatalog.js'
import { supabase } from '../lib/supabase.js'
import { getMergedTracks, getActivityLog } from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'
import { SITE_URL } from '../lib/pageMeta.js'
import FallbackBanner from './FallbackBanner.jsx'
import { bucketisePlaysByDay, totalPlays, deriveNeedsAttention, sparklineX } from './lib/analytics.js'
import './dashboard.css'

// Supabase free tier storage limit (1 GB).
const FREE_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024 // 1 GB

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`
}

const NEEDS_ATTENTION_LABEL = {
  'missing-cover': 'admin.missingCover',
  'missing-audio': 'admin.missingAudio',
  'missing-lyrics': 'admin.missingLyrics',
  'scheduled-soon': 'admin.scheduledSoon',
}

// Hand-drawn 7-day sparkline: slate line, amber dot on the last day.
// Points are inset by the dot radius (sparklineX) so the last dot
// is not clipped at the SVG edge (28 Nov 2026: it rendered as a
// tiny mark at the card edge).
function Sparkline({ buckets, label }) {
  const width = 280
  const height = 44
  const max = Math.max(1, ...buckets.map((b) => b.plays))
  const points = buckets.map((b, i) => {
    const x = sparklineX(i, buckets.length, width)
    const y = height - 4 - (b.plays / max) * (height - 8)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = buckets[buckets.length - 1]
  const lastX = sparklineX(buckets.length - 1, buckets.length, width)
  const lastY = height - 4 - (last.plays / max) * (height - 8)
  return (
    <svg
      className="dash-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <polyline points={points.join(' ')} />
      <circle cx={lastX} cy={lastY} r="4" />
    </svg>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  // Supabase read layer (B1, all statuses for admin); static catalog +
  // local overrides are the fallback.
  const { data: sbTracks, isLoading: tracksLoading, refetch: refetchTracks } = useTracks({ publishedOnly: false })
  const { data: sbAlbums, isLoading: albumsLoading, refetch: refetchAlbums } = useAlbums()
  const { data: sbArtists, isLoading: artistsLoading, refetch: refetchArtists } = useArtists()
  const albumList = sbAlbums || albums
  const artistList = sbArtists || artists
  // While the DB list is still loading, merge NOTHING — the static
  // fallback's 1 track used to paint as "Total tracks 1" and flip
  // to live data after ~5s (28 Nov 2026). Once the query settles
  // without data (DB down), the fallback renders as before.
  const tracksPending = tracksLoading && !sbTracks
  const mergedTracks = useMemo(
    () => getMergedTracks(sbTracks ?? (tracksLoading ? [] : tracks)),
    [sbTracks, tracksLoading],
  )
  const activity = useMemo(() => getActivityLog(), [])
  // Plays 7d / Likes / Followers: null = no data (query failed or
  // empty) → the metric is hidden, never rendered as 0.
  const [plays7d, setPlays7d] = useState(null)
  const [likes, setLikes] = useState(null)
  const [followers, setFollowers] = useState(null)

  useEffect(() => {
    if (!supabase) return undefined
    let cancelled = false
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    void supabase
      .from('play_events')
      .select('played_at, count')
      .gte('played_at', since)
      .then(({ data, error }) => {
        if (cancelled || error) return
        setPlays7d(bucketisePlaysByDay(Array.isArray(data) ? data : [], 7))
      })
    // liked_tracks / followed_artists are owner-only until migration
    // 008 adds admin-read policies — a failed count means "hidden",
    // not "zero". count: exact + head: true reads no rows.
    void supabase
      .from('liked_tracks')
      .select('*', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (!cancelled && !error && typeof count === 'number') setLikes(count)
      })
    void supabase
      .from('followed_artists')
      .select('*', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (!cancelled && !error && typeof count === 'number') setFollowers(count)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const formatNumber = (n) => Number(n || 0).toLocaleString(lang)
  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleString(lang, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }
  // Date label, computed during render (accepted lint baseline item:
  // react(purity) — it is a pure function of `lang` + today, and the
  // admin page re-renders on every edit anyway; see docs/lint-baseline.md).
  const todayLabel = new Date().toLocaleDateString(lang, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const needsAttention = useMemo(() => deriveNeedsAttention(mergedTracks), [mergedTracks])

  const storage = useMemo(() => {
    // Storage estimate: 320 kbps audio ≈ 40 KB per second of audio, plus a
    // small cover allowance. Overrides with a recorded audioSize use it.
    const usedBytes = mergedTracks.reduce((sum, tr) => {
      if (tr.audioSize) return sum + Number(tr.audioSize)
      if (tr.audio320 || tr.audio128) return sum + (Number(tr.durationSec) || 0) * 40 * 1024
      return sum + 400 * 1024 // cover-only placeholder estimate
    }, 0)
    return {
      usedBytes,
      storagePct: Math.min(100, (usedBytes / FREE_STORAGE_LIMIT_BYTES) * 100),
    }
  }, [mergedTracks])

  const topTracks = useMemo(
    () =>
      [...mergedTracks]
        .filter((tr) => tr.status !== 'deleted')
        .sort((a, b) => (Number(b.plays) || 0) - (Number(a.plays) || 0))
        .slice(0, 5),
    [mergedTracks],
  )

  const plays7dTotal = plays7d ? totalPlays(plays7d) : 0

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">{t('admin.dashboard')}</h1>
          <p className="admin-subtitle">
            {todayLabel}
            {user?.email ? ` — ${user.email}` : ''}
          </p>
        </div>
        <Link to="/admin/tracks/new" className="admin-btn admin-btn-primary">
          {t('admin.newTrack')}
        </Link>
      </div>

      <FallbackBanner
        loading={tracksLoading || albumsLoading || artistsLoading}
        onRetry={() => {
          void refetchTracks()
          void refetchAlbums()
          void refetchArtists()
        }}
      />

      <div className="admin-stat-grid">
        {mergedTracks.length > 0 && (
          <div className="admin-stat-card">
            <span className="admin-stat-label">{t('admin.totalTracks')}</span>
            <span className="admin-stat-value">{formatNumber(mergedTracks.length)}</span>
            <span className="admin-stat-sub">
              {albumList.length} {t('admin.albums')} · {artistList.length} {t('admin.artists')}
            </span>
          </div>
        )}
        {plays7d && plays7dTotal > 0 && (
          <div className="admin-stat-card">
            <span className="admin-stat-label">{t('admin.plays7d')}</span>
            <span className="admin-stat-value">{formatNumber(plays7dTotal)}</span>
            <Sparkline buckets={plays7d} label={t('admin.plays7d')} />
          </div>
        )}
        {likes !== null && likes > 0 && (
          <div className="admin-stat-card">
            <span className="admin-stat-label">{t('admin.likes')}</span>
            <span className="admin-stat-value">{formatNumber(likes)}</span>
          </div>
        )}
        {followers !== null && followers > 0 && (
          <div className="admin-stat-card">
            <span className="admin-stat-label">{t('admin.followers')}</span>
            <span className="admin-stat-value">{formatNumber(followers)}</span>
          </div>
        )}
        <div className="admin-stat-card">
          <span className="admin-stat-label">{t('admin.storageUsed')}</span>
          <span className="admin-stat-value">
            {tracksPending ? (
              t('common.loading')
            ) : (
              <>
                {formatBytes(storage.usedBytes)} <span className="admin-stat-sub">/ 1 GB</span>
              </>
            )}
          </span>
          <div
            className="admin-progress"
            role="progressbar"
            aria-valuenow={Math.round(storage.storagePct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('admin.storageUsed')}
          >
            <div className="admin-progress-fill" style={{ width: `${storage.storagePct}%` }} />
          </div>
          <span className="admin-stat-sub">
            {t('admin.storagePct', { pct: storage.storagePct.toFixed(1) })}
          </span>
        </div>
      </div>

      <div className="admin-two-col">
        <section className="admin-panel" aria-labelledby="admin-needs-attention">
          <h2 className="admin-panel-title" id="admin-needs-attention">{t('admin.needsAttention')}</h2>
          {tracksPending ? (
            <p className="admin-muted">{t('common.loading')}</p>
          ) : needsAttention.length === 0 ? (
            <p className="admin-muted">{t('admin.needsAttentionEmpty')}</p>
          ) : (
            <ul className="dash-attention-list">
              {needsAttention.map((item) => (
                <li key={`${item.kind}-${item.trackId}`} className="dash-attention-item">
                  <span className="dash-attention-kind">{t(NEEDS_ATTENTION_LABEL[item.kind])}</span>
                  <span className="dash-attention-title">{item.trackTitle}</span>
                  <Link to={`/admin/tracks/${item.trackId}/edit`} className="admin-link">
                    {t('admin.fixIt')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="dash-quick-actions" aria-label={t('admin.quickActions')}>
            <Link to="/admin/tracks/new" className="admin-btn admin-btn-primary">
              {t('admin.newTrack')}
            </Link>
            <Link to="/admin/playlists" className="admin-btn">
              {t('admin.newPlaylist')}
            </Link>
            <a href={SITE_URL} target="_blank" rel="noreferrer" className="admin-btn">
              {t('admin.viewLiveSite')}
            </a>
          </div>
        </section>

        <section className="admin-panel" aria-labelledby="admin-recent-activity">
          <h2 className="admin-panel-title" id="admin-recent-activity">{t('admin.recentActivity')}</h2>
          {activity.length === 0 ? (
            <p className="admin-muted">{t('common.noResults')}</p>
          ) : (
            <ul className="admin-activity-list">
              {activity.slice(0, 10).map((entry) => (
                <li key={entry.id} className="admin-activity-item">
                  <span className="admin-activity-action">
                    {entry.action}
                    {entry.detail ? ` — ${entry.detail}` : ''}
                  </span>
                  <span className="admin-activity-meta">
                    {entry.actor || 'Admin'} · {formatDate(entry.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="admin-panel" aria-labelledby="admin-top-tracks">
        <h2 className="admin-panel-title" id="admin-top-tracks">{t('admin.topTracks')}</h2>
        {tracksPending ? (
          <p className="admin-muted">{t('common.loading')}</p>
        ) : topTracks.length === 0 ? (
          <p className="admin-muted">{t('admin.noTracksFound')}</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">{t('admin.title')}</th>
                  <th scope="col">{t('admin.artist')}</th>
                  <th scope="col">{t('admin.plays')}</th>
                </tr>
              </thead>
              <tbody>
                {topTracks.map((tr, i) => (
                  <tr key={tr.id}>
                    <td>{i + 1}</td>
                    <td>
                      <Link to={`/admin/tracks/${tr.id}/edit`} className="admin-link">
                        {tr.titleTa || tr.titleEn || tr.id}
                      </Link>
                      {tr.titleEn && tr.titleTa ? (
                        <span className="admin-cell-sub">{tr.titleEn}</span>
                      ) : null}
                    </td>
                    <td>{tr.artist || '—'}</td>
                    <td>{formatNumber(tr.plays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Link to="/admin/tracks" className="admin-link">
          {t('admin.viewAllTracks')}
        </Link>
      </section>
    </div>
  )
}
