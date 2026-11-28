// Tracks admin — paginated table with search, filters, bulk actions.
// Status values are lowercase in the catalog; labels come from locales.
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { tracks as catalogTracks, albums as catalogAlbums } from '../data/catalog.js'
import { useTracks, useAlbums } from '../lib/supabaseCatalog.js'
import {
  supabaseWritesEnabled,
  saveTrackToSupabase,
  deleteTrackFromSupabase,
  adminDeleteErrorMessage,
  withTimeout,
  SAVE_TIMEOUT_MS,
} from '../lib/supabaseAdmin.js'
import { useToast } from '../lib/toast.jsx'
import {
  useDebouncedValue,
  sortRows,
  paginateRows,
  pageCountFor,
  clampPage,
  LIST_PAGE_SIZES,
} from './lib/listUtils.js'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import './lists.css'
import {
  getMergedTracks,
  restoreAdminTrack,
  logActivity,
  invalidateCaches,
  STATUS_LABEL_KEYS,
  GENRE_LABEL_KEYS,
  normalizeStatus,
} from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'
import FallbackBanner from './FallbackBanner.jsx'

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
  const [error, setError] = useState('')
  const [confirmState, setConfirmState] = useState(null) // { kind: 'delete'|'bulkDelete', track? }
  const [sort, setSort] = useState({ key: 'title', dir: 'asc' })
  const [pageSize, setPageSize] = useState(25)
  const showToast = useToast()

  const statusLabel = (s) => t(STATUS_LABEL_KEYS[normalizeStatus(s)] || 'admin.statusDraft')
  const genreLabel = (g) => (GENRE_LABEL_KEYS[g] ? t(GENRE_LABEL_KEYS[g]) : g || '—')

  // Supabase read layer (B1, all statuses for admin); static catalog +
  // local overrides are the fallback.
  const { data: sbTracks, isLoading: tracksLoading, refetch: refetchTracks } = useTracks({ publishedOnly: false })
  const { data: sbAlbums, isLoading: albumsLoading, refetch: refetchAlbums } = useAlbums()
  const adminTracks = useMemo(() => getMergedTracks(sbTracks || catalogTracks), [version, sbTracks])
  const albumOptions = sbAlbums || catalogAlbums
  const debouncedSearch = useDebouncedValue(search)
  const visible = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return adminTracks.filter((tr) => {
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
  }, [adminTracks, debouncedSearch, albumFilter, genreFilter, statusFilter, showDeleted])

  const trackSortValue = (tr, key) => {
    if (key === 'title') return tr.titleTa || tr.titleEn || ''
    if (key === 'artist') return tr.artist || ''
    if (key === 'album') return tr.album || ''
    if (key === 'plays') return Number(tr.plays || 0)
    return ''
  }
  const trackSortKind = (key) => (key === 'plays' ? 'number' : 'text')
  const sorted = useMemo(
    () => sortRows(visible, sort.key, sort.dir, trackSortValue, trackSortKind(sort.key)),
    [visible, sort],
  )
  const pageCount = pageCountFor(sorted.length, pageSize)
  const currentPage = clampPage(page, sorted.length, pageSize)
  const pageTracks = paginateRows(sorted, currentPage, pageSize)

  const toggleSort = (key) => {
    setSort((prev) => (prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' }))
    setPage(1)
  }
  const sortHeader = (key, label) => (
    <button
      type="button"
      className="list-sort-btn"
      onClick={() => toggleSort(key)}
      aria-label={`${label} — ${sort.key === key && sort.dir === 'desc' ? t('admin.sortDesc') : t('admin.sortAsc')}`}
    >
      {label}
      <span className="list-sort-arrow" aria-hidden="true">
        {sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </button>
  )

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
    // H3: defense in depth — RLS is the real gate, but a non-admin
    // must never reach the write loop at all.
    if (!isAdmin) {
      setError(t('admin.notAdmin'))
      return
    }
    setError('')
    // Supabase path (B1): 'unlisted' is stored as 'draft' (DB check
    // allows draft/scheduled/published only). A failed write stops
    // the batch with a clear message — no silent local fallback.
    if (supabaseWritesEnabled()) {
      // M33: keep going through failures and report per-track — the
      // old loop broke on the first failure, leaving earlier tracks
      // published with only a count reported. H1: tracks are saved
      // by slug as well as by dbId (fallback-served tracks have no
      // dbId but do have a DB row), so nothing is silently skipped.
      let done = 0
      const failed = []
      for (const id of selected) {
        const track = adminTracks.find((tr) => tr.id === id)
        if (!track) {
          failed.push(id)
          continue
        }
        try {
          await saveTrackToSupabase({ ...track, status })
          done += 1
        } catch {
          failed.push(track.titleTa || track.titleEn || track.id)
        }
      }
      if (done > 0) {
        logActivity({
          actor: user?.email || 'Admin',
          action: `Bulk ${status === 'published' ? 'published' : 'unpublished'} tracks`,
          detail: `${done} track(s) → ${status}`,
        })
        showToast(t('admin.bulkStatusSet', { count: done, status: statusLabel(status) }))
      }
      if (failed.length > 0) {
        setError(t('admin.bulkStatusFailed', { count: failed.length, titles: failed.join(', ') }))
      }
      setSelected(new Set())
      setVersion((v) => v + 1)
      return
    }
    // Admin is Supabase-only (27 Nov 2026): no local fallback.
    setError(t('admin.dbNotConnected'))
  }

  // Delete is a hard delete in the DB — there is no soft-delete to
  // undo, so no Undo toast is offered (saying so honestly instead
  // of faking one).
  const handleDelete = (track) => {
    setConfirmState({ kind: 'delete', track })
  }

  const doDeleteTrack = async (track) => {
    const title = track.titleTa || track.titleEn || track.id
    // H3: defense in depth — RLS is the real gate.
    if (!isAdmin) {
      setError(t('admin.notAdmin'))
      return
    }
    setError('')
    // Supabase rows are hard-deleted (no 'deleted' status in the DB).
    // H1: delete works by slug too — fallback-served tracks have no
    // dbId but deleteTrackFromSupabase resolves them by slug.
    if (supabaseWritesEnabled()) {
      try {
        await deleteTrackFromSupabase(track)
      } catch (err) {
        setError(adminDeleteErrorMessage(err, t))
        return
      }
      logActivity({ actor: user?.email || 'Admin', action: 'Deleted track', detail: title })
      // Refetch explicitly before the toast: the invalidation inside
      // deleteTrackFromSupabase schedules a refetch, but the list
      // must show the deletion NOW — the toast used to appear while
      // the list still showed the deleted row (28 Nov 2026).
      await refetchTracks()
      showToast(t('admin.itemDeleted', { title }))
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(track.id)
        return next
      })
      setVersion((v) => v + 1)
      return
    }
    // Admin is Supabase-only (27 Nov 2026): a track without a
    // database row cannot be deleted from here.
    setError(t('admin.dbNotConnected'))
  }

  const doBulkDelete = async () => {
    if (selected.size === 0) return
    if (!isAdmin) {
      setError(t('admin.notAdmin'))
      return
    }
    setError('')
    if (!supabaseWritesEnabled()) {
      setError(t('admin.dbNotConnected'))
      return
    }
    let done = 0
    const failed = []
    for (const id of selected) {
      const track = adminTracks.find((tr) => tr.id === id)
      if (!track) {
        failed.push(id)
        continue
      }
      try {
        await deleteTrackFromSupabase(track)
        done += 1
      } catch {
        failed.push(track.titleTa || track.titleEn || track.id)
      }
    }
    if (done > 0) {
      logActivity({ actor: user?.email || 'Admin', action: 'Bulk deleted tracks', detail: `${done} track(s)` })
      await refetchTracks()
      showToast(t('admin.bulkDeleteResult', { done, total: selected.size }))
    }
    if (failed.length > 0) {
      setError(t('admin.bulkDeleteFailed', { count: failed.length, titles: failed.join(', ') }))
    }
    setSelected(new Set())
    setVersion((v) => v + 1)
  }

  // Row-level Unpublish: prefer unpublishing over deleting a
  // published track. Uses the existing save path.
  const handleUnpublish = async (track) => {
    const title = track.titleTa || track.titleEn || track.id
    if (!isAdmin) {
      setError(t('admin.notAdmin'))
      return
    }
    setError('')
    if (!supabaseWritesEnabled()) {
      setError(t('admin.dbNotConnected'))
      return
    }
    try {
      await withTimeout(
        saveTrackToSupabase({ ...track, status: 'unlisted' }),
        SAVE_TIMEOUT_MS,
        'Track unpublish',
      )
    } catch (err) {
      setError(err?.code === 'timeout' ? t('admin.saveTimeout') : adminDeleteErrorMessage(err, t))
      return
    }
    logActivity({ actor: user?.email || 'Admin', action: 'Unpublished track', detail: title })
    await refetchTracks()
    showToast(t('admin.trackUnpublished', { title }))
    setVersion((v) => v + 1)
  }

  const handleRestore = async (track) => {
    const title = track.titleTa || track.titleEn || track.id
    restoreAdminTrack(track.id)
    logActivity({ actor: user?.email || 'Admin', action: 'Restored track', detail: title })
    await invalidateCaches(track.id)
    await refetchTracks()
    showToast(t('admin.trackRestored', { title }))
    setVersion((v) => v + 1)
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">{t('admin.tracks')}</h1>
          <p className="admin-subtitle">
            {t('admin.tracksFound', { visible: visible.length, total: adminTracks.length })}
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={() => navigate('/admin/tracks/new')}>
          {t('admin.newTrack')}
        </button>
      </div>

      {error && (
        <div className="admin-notice admin-notice-warn" role="alert" aria-live="polite">
          {error}
          <button
            type="button"
            className="admin-btn admin-btn-small"
            onClick={() => {
              setError('')
              void refetchTracks()
              void refetchAlbums()
            }}
            style={{ marginLeft: 12 }}
          >
            {t('admin.fallbackRetry')}
          </button>
        </div>
      )}

      <FallbackBanner
        loading={tracksLoading || albumsLoading}
        onRetry={() => {
          void refetchTracks()
          void refetchAlbums()
        }}
      />

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
          {albumOptions.map((a) => (
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
        <label className="list-page-size">
          {t('admin.rowsPerPage')}
          <select
            className="admin-input"
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
            aria-label={t('admin.rowsPerPage')}
          >
            {LIST_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
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
          <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => setConfirmState({ kind: 'bulkDelete' })}>
            {t('admin.bulkDelete')}
          </button>
          <button type="button" className="admin-btn admin-btn-small admin-btn-ghost" onClick={() => setSelected(new Set())}>
            {t('common.cancel')}
          </button>
        </div>
      )}

      {tracksLoading ? (
        <div className="list-skeleton" aria-busy="true" aria-label={t('admin.loadingRows')}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="list-skeleton-row" />
          ))}
        </div>
      ) : pageTracks.length === 0 ? (
        <div className="admin-empty">
          <h2>{t('admin.noTracksFound')}</h2>
          <p>{t('admin.noTracksFoundHint')}</p>
          <button type="button" className="admin-btn admin-btn-primary" onClick={() => navigate('/admin/tracks/new')}>
            {t('admin.addFirstTrack')}
          </button>
        </div>
      ) : (
        <>
        <div className="admin-table-wrap list-table-wrap">
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
                <th scope="col" aria-sort={sort.key === 'title' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortHeader('title', t('admin.title'))}</th>
                <th scope="col" aria-sort={sort.key === 'artist' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortHeader('artist', t('admin.artist'))}</th>
                <th scope="col" aria-sort={sort.key === 'album' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortHeader('album', t('admin.album'))}</th>
                <th scope="col">{t('admin.genre')}</th>
                <th scope="col">{t('admin.status')}</th>
                <th scope="col" aria-sort={sort.key === 'plays' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortHeader('plays', t('admin.plays'))}</th>
                <th scope="col">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {pageTracks.map((tr) => (
                <tr key={tr.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(tr.id)} onChange={() => toggleSelect(tr.id)} aria-label={tr.titleTa || tr.titleEn || tr.id} />
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
                    {normalizeStatus(tr.status) === 'scheduled' && (tr.scheduledAt || tr.releaseDate) && (
                      <span className="admin-cell-sub"> {tr.scheduledAt || tr.releaseDate}</span>
                    )}
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
                          {isAdmin && normalizeStatus(tr.status) === 'published' && (
                            <button type="button" className="admin-btn admin-btn-small" onClick={() => handleUnpublish(tr)}>
                              {t('common.unpublish')}
                            </button>
                          )}
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
        <div className="list-cards">
          {pageTracks.map((tr) => (
            <article key={tr.id} className="list-card">
              {tr.cover ? (
                <img src={tr.cover} alt="" className="list-card-thumb" />
              ) : (
                <img src="/assets/nandha-logo.png" alt="" className="list-card-thumb" />
              )}
              <div className="list-card-body">
                <span className="list-card-title">{tr.titleTa || tr.titleEn || '—'}</span>
                <span className="list-card-sub">
                  {tr.titleEn && tr.titleTa ? tr.titleEn : ''}{tr.artist ? ` · ${tr.artist}` : ''}
                </span>
                <span className="list-card-meta">
                  <span className={`admin-badge admin-badge-${normalizeStatus(tr.status)}`}>
                    {statusLabel(tr.status)}
                  </span>
                  {normalizeStatus(tr.status) === 'scheduled' && (tr.scheduledAt || tr.releaseDate) && (
                    <span className="admin-cell-sub">{tr.scheduledAt || tr.releaseDate}</span>
                  )}
                </span>
              </div>
              <details className="list-card-menu">
                <summary aria-label={`${t('common.actions')} — ${tr.titleTa || tr.titleEn || tr.id}`}>⋯</summary>
                <div className="list-card-menu-actions">
                  <Link to={`/admin/tracks/${tr.id}/edit`} className="admin-btn admin-btn-small">
                    {t('common.edit')}
                  </Link>
                  {isAdmin && normalizeStatus(tr.status) === 'published' && (
                    <button type="button" className="admin-btn admin-btn-small" onClick={() => handleUnpublish(tr)}>
                      {t('common.unpublish')}
                    </button>
                  )}
                  {isAdmin && (
                    <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => handleDelete(tr)}>
                      {t('common.delete')}
                    </button>
                  )}
                </div>
              </details>
            </article>
          ))}
        </div>
        </>
      )}

      <ConfirmDialog
        open={confirmState?.kind === 'delete'}
        title={t('admin.confirmDelete', { title: confirmState?.track?.titleTa || confirmState?.track?.titleEn || confirmState?.track?.id || '' })}
        body={t('admin.deleteNoUndo')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          const track = confirmState.track
          setConfirmState(null)
          void doDeleteTrack(track)
        }}
        onCancel={() => setConfirmState(null)}
      />
      <ConfirmDialog
        open={confirmState?.kind === 'bulkDelete'}
        title={t('admin.bulkDelete')}
        body={t('admin.bulkDeleteConfirm', { count: selected.size })}
        confirmLabel={t('admin.bulkDelete')}
        danger
        onConfirm={() => {
          setConfirmState(null)
          void doBulkDelete()
        }}
        onCancel={() => setConfirmState(null)}
      />

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
