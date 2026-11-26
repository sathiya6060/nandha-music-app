// Admin dashboard — headline stats, top tracks, recent activity.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { tracks, albums, artists } from '../data/catalog.js'
import { getMergedTracks, getActivityLog, loadUsers } from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'

// Supabase free tier storage limit used as the demo "free limit".
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

export default function Dashboard() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const mergedTracks = useMemo(() => getMergedTracks(tracks), [])
  const activity = useMemo(() => getActivityLog(), [])
  const users = useMemo(() => loadUsers(), [])

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

  const stats = useMemo(() => {
    const totalPlays = mergedTracks.reduce((sum, tr) => sum + (Number(tr.plays) || 0), 0)
    // Storage estimate: 320 kbps audio ≈ 40 KB per second of audio, plus a
    // small cover allowance. Overrides with a recorded audioSize use it.
    const usedBytes = mergedTracks.reduce((sum, tr) => {
      if (tr.audioSize) return sum + Number(tr.audioSize)
      if (tr.audio320 || tr.audio128) return sum + (Number(tr.durationSec) || 0) * 40 * 1024
      return sum + 400 * 1024 // cover-only placeholder estimate
    }, 0)
    return {
      totalPlays,
      totalTracks: mergedTracks.length,
      totalAlbums: albums.length,
      totalArtists: artists.length,
      totalUsers: users.length,
      usedBytes,
      storagePct: Math.min(100, (usedBytes / FREE_STORAGE_LIMIT_BYTES) * 100),
    }
  }, [mergedTracks, users.length])

  const topTracks = useMemo(
    () =>
      [...mergedTracks]
        .filter((tr) => tr.status !== 'deleted')
        .sort((a, b) => (Number(b.plays) || 0) - (Number(a.plays) || 0))
        .slice(0, 5),
    [mergedTracks],
  )

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">{t('admin.dashboard')}</h1>
          <p className="admin-subtitle">
            {t('admin.welcomeBack')}
            {user?.email ? ` — ${user.email}` : ''}
          </p>
        </div>
        <Link to="/admin/tracks/new" className="admin-btn admin-btn-primary">
          {t('admin.newTrack')}
        </Link>
      </div>

      <div className="admin-stat-grid">
        <div className="admin-stat-card">
          <span className="admin-stat-label">{t('admin.totalPlays')}</span>
          <span className="admin-stat-value">{formatNumber(stats.totalPlays)}</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-label">{t('admin.totalTracks')}</span>
          <span className="admin-stat-value">{formatNumber(stats.totalTracks)}</span>
          <span className="admin-stat-sub">
            {stats.totalAlbums} {t('admin.albums')} · {stats.totalArtists} {t('admin.artists')}
          </span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-label">{t('admin.totalUsers')}</span>
          <span className="admin-stat-value">{formatNumber(stats.totalUsers)}</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-label">{t('admin.storageUsed')}</span>
          <span className="admin-stat-value">
            {formatBytes(stats.usedBytes)} <span className="admin-stat-sub">/ 1 GB</span>
          </span>
          <div
            className="admin-progress"
            role="progressbar"
            aria-valuenow={Math.round(stats.storagePct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('admin.storageUsed')}
          >
            <div className="admin-progress-fill" style={{ width: `${stats.storagePct}%` }} />
          </div>
          <span className="admin-stat-sub">
            {t('admin.storagePct', { pct: stats.storagePct.toFixed(1) })}
          </span>
        </div>
      </div>

      <div className="admin-two-col">
        <section className="admin-panel" aria-labelledby="admin-top-tracks">
          <h2 className="admin-panel-title" id="admin-top-tracks">{t('admin.topTracks')}</h2>
          {topTracks.length === 0 ? (
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
    </div>
  )
}
