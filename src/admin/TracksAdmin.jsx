// Tracks admin — paginated table with search, filters, bulk actions.
// Status values are lowercase in the catalog; labels come from locales.
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { allTracks as catalogTracks, allAlbums as catalogAlbums } from '../data/catalog.js'
import {
  getMergedTracks,
  saveAdminTrack,
  deleteAdminTrack,
  restoreAdminTrack,
  logActivity,
  invalidateCaches,
  STATUS_LABEL_KEYS,
  GENRE_LABEL_KEYS,
  normalizeStatus,
} from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'

const PAGE_SIZE = 20
const STATUS_VALUES = ['draft', 'scheduled', 'published', 'unlisted']
const GENRES = ['Devotional', 'Love', 'Melody', 'Siddhar', 'Sivan']

function formatDuration(sec) {
  const s = Number(sec) || 0
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function TracksAdmin() {
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const { t, lang } = useI18n()
  const [version, setVersion] = useState(0)
  const [search, setSearch] = useState('')
  const [albumFilter, setAlbumFilter] = useState('all')
  const [genreFilter, setGenreFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showDeleted, setShowDeleted] = useState(false)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(new Set())
  const [notice, setNotice] = useState('')

  const statusLabel = (s) => t(STATUS_LABEL_KEYS[normalizeStatus(s)] || 'admin.statusDraft')
  const genreLabel = (g) => (GENRE_LABEL_KEYS[g] ? t(GENRE_LABEL_KEYS[g]) : g || '—')

  const allTracks = useMemo(() => getMergedTracks(catalogTracks), [version])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allTracks.filter((tr) => {
      if (!showDeleted && tr.status === 'deleted') return false
      if (showDeleted && tr.status !== 'deleted') return false
      if (albumFilter !== 'all' && tr.albumId !== albumFilter && tr.album !== albumFilter) return false
      if (genreFilter !== 'all' && tr.genre !== genreFilter) return false
      if (statusFilter !== 'all' && normalizeStatus(tr.status) !== statusFilter) return false
      if (!q) return true
      return [tr.titleTa, tr.titleEn, tr.artist, tr.album, tr.genre]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    })
  }, [allTracks, search, albumFilter, genreFilter, statusFilter, showDeleted])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageTracks = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectPage = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = pageTracks.every((tr) => next.has(tr.id))
      for (const tr of pageTracks) {
        if (allSelected) next.delete(tr.id)
        else next.add(tr.id)
      }
      return next
    })
  }

  const bulkSetStatus = async (status) => {
    if (selected.size === 0) return
    for (const id of selected) {
      const track = allTracks.find((tr) => tr.id === id)
      if (!track) continue
      saveAdminTrack({ ...track, status })
      await invalidateCaches(id)
    }
    logActivity({
      actor: user?.email || 'Admin',
      action: `Bulk ${status === 'published' ? 'published' : 'unpublished'} tracks`,
      detail: `${selected.size} track(s) → ${status}`,
    })
    setNotice(t('admin.bulkStatusSet', { count: selected.size, status: statusLabel(status) }))
    setSelected(new Set())
    setVersion((v) => v + 1)
  }

  const handleDelete = async (track) => {
    const title = track.titleTa || track.titleEn || track.id
    if (!window.confirm(t('admin.confirmDelete', { title }))) return
    deleteAdminTrack(track.id)
    logActivity({ actor: user?.email || 'Admin', action: 'Deleted track', detail: title })
    await invalidateCaches(track.id)
    setNotice(t('admin.trackDeleted', { title }))
    setVersion((v) => v + 1)
  }

  const handleRestore = async (track) => {
    const title = track.titleTa || track.titleEn || track.id
    restoreAdminTrack(track.id)
    logActivity({ actor: user?.email || 'Admin', action: 'Restored track', detail: title })
    await invalidateCaches(track.id)
    setNotice(t('admin.trackRestored', { title }))
    setVersion((v) => v + 1)
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">{t('admin.tracks')}</h1>
          <p className="admin-subtitle">
            {t('admin.tracksFound', { visible: visible.length, total: allTracks.length })}
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={() => navigate('/admin/tracks/new')}>
          {t('admin.newTrack')}
        </button>
      </div>

      {notice && (
        <div className="admin-notice" role="status" aria-live="polite">
          {notice}
          <button type="button" className="admin-notice-close" onClick={() => setNotice('')} aria-label={t('common.close')}>
            ×
          </button>
        </div>
      )}

      <div className="admin-toolbar">
        <input
          type="search"
          className="admin-input admin-search"
          placeholder={t('admin.searchTracks')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          aria-label={t('admin.searchTracks')}
        />
        <select className="admin-input" value={albumFilter} onChange={(e) => { setAlbumFilter(e.target.value); setPage(1) }} aria-label={t('admin.allAlbums')}>
          <option value="all">{t('admin.allAlbums')}</option>
          {catalogAlbums.map((a) => (
            <option key={a.id} value={a.id}>
              {a.titleTa || a.titleEn || a.id}
            </option>
          ))}
        </select>
        <select className="admin-input" value={genreFilter} onChange={(e) => { setGenreFilter(e.target.value); setPage(1) }} aria-label={t('admin.allGenres')}>
          <option value="all">{t('admin.allGenres')}</option>
          {GENRES.map((g) => (
            <option key={g} value={g}>{genreLabel(g)}</option>
          ))}
        </select>
        <select className="admin-input" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} aria-label={t('admin.allStatuses')}>
          <option value="all">{t('admin.allStatuses')}</option>
          {STATUS_VALUES.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
        <label className="admin-check-label">
          <input type="checkbox" checked={showDeleted} onChange={(e) => { setShowDeleted(e.target.checked); setPage(1) }} />
          {t('admin.statusDeleted')}
        </label>
      </div>

      {selected.size > 0 && (
        <div className="admin-bulkbar">
          <span>{t('admin.selectedCount', { count: selected.size })}</span>
          <button type="button" className="admin-btn admin-btn-small" onClick={() => bulkSetStatus('published')}>
            {t('common.publish')}
          </button>
          <button type="button" className="admin-btn admin-btn-small" onClick={() => bulkSetStatus('unlisted')}>
            {t('common.unpublish')}
          </button>
          <button type="button" className="admin-btn admin-btn-small admin-btn-ghost" onClick={() => setSelected(new Set())}>
            {t('common.cancel')}
          </button>
        </div>
      )}

      {pageTracks.length === 0 ? (
        <div className="admin-empty">
          <h2>{t('admin.noTracksFound')}</h2>
          <p>{t('admin.noTracksFoundHint')}</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">
                  <input
                    type="checkbox"
                    checked={pageTracks.length > 0 && pageTracks.every((tr) => selected.has(tr.id))}
                    onChange={toggleSelectPage}
                    aria-label={t('admin.tracks')}
                  />
                </th>
                <th scope="col">{t('admin.cover')}</th>
                <th scope="col">{t('admin.title')}</th>
                <th scope="col">{t('admin.artist')}</th>
                <th scope="col">{t('admin.album')}</th>
                <th scope="col">{t('admin.genre')}</th>
                <th scope="col">{t('admin.status')}</th>
                <th scope="col">{t('admin.plays')}</th>
                <th scope="col">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {pageTracks.map((tr) => (
                <tr key={tr.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(tr.id)} onChange={() => toggleSelect(tr.id)} aria-label={tr.titleEn || tr.titleTa || tr.id} />
                  </td>
                  <td>
                    {tr.cover ? (
                      <img src={tr.cover} alt="" className="admin-thumb" />
                    ) : (
                      <img src="/assets/nandha-logo.png" alt="" className="admin-thumb admin-thumb-logo" />
                    )}
                  </td>
                  <td>
                    <span className="admin-cell-main">{tr.titleTa || '—'}</span>
                    <span className="admin-cell-sub">
                      {tr.titleEn || ''}
                      {tr.durationSec ? ` · ${formatDuration(tr.durationSec)}` : ''}
                    </span>
                  </td>
                  <td>{tr.artist || '—'}</td>
                  <td>{tr.album || '—'}</td>
                  <td>{genreLabel(tr.genre)}</td>
                  <td>
                    <span className={`admin-badge admin-badge-${normalizeStatus(tr.status)}`}>
                      {statusLabel(tr.status)}
                    </span>
                  </td>
                  <td>{Number(tr.plays || 0).toLocaleString(lang)}</td>
                  <td>
                    <div className="admin-row-actions">
                      {tr.status === 'deleted' ? (
                        <button type="button" className="admin-btn admin-btn-small" onClick={() => handleRestore(tr)}>
                          {t('common.restore')}
                        </button>
                      ) : (
                        <>
                          <Link to={`/admin/tracks/${tr.id}/edit`} className="admin-btn admin-btn-small">
                            {t('common.edit')}
                          </Link>
                          {isAdmin && (
                            <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => handleDelete(tr)}>
                              {t('common.delete')}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-pagination">
        <button type="button" className="admin-btn admin-btn-small" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
          {t('common.previous')}
        </button>
        <span>
          {t('common.pageOf', { page: currentPage, total: pageCount })}
        </span>
        <button type="button" className="admin-btn admin-btn-small" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
          {t('common.next')}
        </button>
      </div>
    </div>
  )
}
