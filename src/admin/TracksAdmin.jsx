// Tracks admin — paginated table with search, filters, bulk actions.
// Status values are lowercase in the catalog; labels come from locales.
// List scaffolding (search/sort/page/selection/delete) lives in the
// shared useAdminList hook + AdminList components.
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
import { useAdminList } from './lib/useAdminList.jsx'
import {
  AdminPageHead,
  AdminErrorNotice,
  AdminToolbar,
  AdminBulkBar,
  AdminListContent,
  AdminFirstColumns,
  AdminTable,
  AdminCards,
  AdminCard,
  AdminPagination,
  AdminDeleteDialogs,
} from './components/AdminList.jsx'
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

// The Edit / Unpublish / Delete action set, rendered identically in
// the table row and the mobile card (the table's deleted-row Restore
// button stays in the page — only the shared set moves here).
function TrackActions({ t, tr, isAdmin, onUnpublish, onDelete }) {
  return (
    <>
      <Link to={`/admin/tracks/${tr.id}/edit`} className="admin-btn admin-btn-small">
        {t('common.edit')}
      </Link>
      {isAdmin && normalizeStatus(tr.status) === 'published' && (
        <button type="button" className="admin-btn admin-btn-small" onClick={() => onUnpublish(tr)}>
          {t('common.unpublish')}
        </button>
      )}
      {isAdmin && (
        <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => onDelete(tr)}>
          {t('common.delete')}
        </button>
      )}
    </>
  )
}

export default function TracksAdmin() {
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const { t, lang } = useI18n()
  const [albumFilter, setAlbumFilter] = useState('all')
  const [genreFilter, setGenreFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showDeleted, setShowDeleted] = useState(false)
  const [version, setVersion] = useState(0)
  const showToast = useToast()

  const statusLabel = (s) => t(STATUS_LABEL_KEYS[normalizeStatus(s)] || 'admin.statusDraft')
  const genreLabel = (g) => (GENRE_LABEL_KEYS[g] ? t(GENRE_LABEL_KEYS[g]) : g || '—')

  // Supabase read layer (B1, all statuses for admin); static catalog +
  // local overrides are the fallback.
  const { data: sbTracks, isLoading: tracksLoading, refetch: refetchTracks } = useTracks({ publishedOnly: false })
  const { data: sbAlbums, isLoading: albumsLoading, refetch: refetchAlbums } = useAlbums()
  const adminTracks = useMemo(() => getMergedTracks(sbTracks || catalogTracks), [version, sbTracks])
  const albumOptions = sbAlbums || catalogAlbums
  // Page-specific filters (search/sort/page/selection live in the hook).
  const preFiltered = useMemo(
    () =>
      adminTracks.filter((tr) => {
        if (!showDeleted && tr.status === 'deleted') return false
        if (showDeleted && tr.status !== 'deleted') return false
        if (albumFilter !== 'all' && tr.albumId !== albumFilter && tr.album !== albumFilter) return false
        if (genreFilter !== 'all' && tr.genre !== genreFilter) return false
        if (statusFilter !== 'all' && normalizeStatus(tr.status) !== statusFilter) return false
        return true
      }),
    [adminTracks, albumFilter, genreFilter, statusFilter, showDeleted],
  )
  const list = useAdminList({
    t,
    user,
    isAdmin,
    showToast,
    rows: preFiltered,
    searchFilter: (tr, q) =>
      !q ||
      [tr.titleTa, tr.titleEn, tr.artist, tr.album, tr.genre]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    sortValue: (tr, key) => {
      if (key === 'title') return tr.titleTa || tr.titleEn || ''
      if (key === 'artist') return tr.artist || ''
      if (key === 'album') return tr.album || ''
      if (key === 'plays') return Number(tr.plays || 0)
      return ''
    },
    sortKind: (key) => (key === 'plays' ? 'number' : 'text'),
    initialSort: { key: 'title', dir: 'asc' },
    bumpVersion: () => setVersion((v) => v + 1),
  })

  const bulkSetStatus = async (status) => {
    if (list.selected.size === 0) return
    // H3: defense in depth — RLS is the real gate, but a non-admin
    // must never reach the write loop at all.
    if (!isAdmin) {
      list.setError(t('admin.notAdmin'))
      return
    }
    list.setError('')
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
      for (const id of list.selected) {
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
        list.setError(t('admin.bulkStatusFailed', { count: failed.length, titles: failed.join(', ') }))
      }
      list.clearSelection()
      list.bumpVersion()
      return
    }
    // Admin is Supabase-only (27 Nov 2026): no local fallback.
    list.setError(t('admin.dbNotConnected'))
  }

  // Delete is a hard delete in the DB — there is no soft-delete to
  // undo, so no Undo toast is offered (saying so honestly instead
  // of faking one).
  const handleDelete = (track) => {
    list.setConfirmState({ kind: 'delete', item: track })
  }

  const doDeleteTrack = (track) =>
    list.deleteOne({
      item: track,
      label: track.titleTa || track.titleEn || track.id,
      deleteFn: deleteTrackFromSupabase,
      activity: 'Deleted track',
      refetch: refetchTracks,
    })

  const doBulkDelete = () =>
    list.deleteSelected({
      items: adminTracks,
      getLabel: (tr) => tr.titleTa || tr.titleEn || tr.id,
      deleteFn: deleteTrackFromSupabase,
      activity: 'Bulk deleted tracks',
      bulkUnit: 'track(s)',
      refetch: refetchTracks,
    })

  // Row-level Unpublish: prefer unpublishing over deleting a
  // published track. Uses the existing save path.
  const handleUnpublish = async (track) => {
    const title = track.titleTa || track.titleEn || track.id
    if (!isAdmin) {
      list.setError(t('admin.notAdmin'))
      return
    }
    list.setError('')
    if (!supabaseWritesEnabled()) {
      list.setError(t('admin.dbNotConnected'))
      return
    }
    try {
      await withTimeout(
        saveTrackToSupabase({ ...track, status: 'unlisted' }),
        SAVE_TIMEOUT_MS,
        'Track unpublish',
      )
    } catch (err) {
      list.setError(err?.code === 'timeout' ? t('admin.saveTimeout') : adminDeleteErrorMessage(err, t))
      return
    }
    logActivity({ actor: user?.email || 'Admin', action: 'Unpublished track', detail: title })
    await refetchTracks()
    showToast(t('admin.trackUnpublished', { title }))
    list.bumpVersion()
  }

  const handleRestore = async (track) => {
    const title = track.titleTa || track.titleEn || track.id
    restoreAdminTrack(track.id)
    logActivity({ actor: user?.email || 'Admin', action: 'Restored track', detail: title })
    await invalidateCaches(track.id)
    await refetchTracks()
    showToast(t('admin.trackRestored', { title }))
    list.bumpVersion()
  }

  const deleteTrack = list.confirmState?.item
  return (
    <div className="admin-page">
      <AdminPageHead
        title={t('admin.tracks')}
        subtitle={t('admin.tracksFound', { visible: list.visible.length, total: adminTracks.length })}
        newLabel={t('admin.newTrack')}
        onNew={() => navigate('/admin/tracks/new')}
      />

      <AdminErrorNotice
        error={list.error}
        role="alert"
        retryLabel={t('admin.fallbackRetry')}
        onRetry={() => {
          list.setError('')
          void refetchTracks()
          void refetchAlbums()
        }}
      />

      <FallbackBanner
        loading={tracksLoading || albumsLoading}
        onRetry={() => {
          void refetchTracks()
          void refetchAlbums()
        }}
      />

      <AdminToolbar t={t} list={list} searchPlaceholder={t('admin.searchTracks')} searchLabel={t('admin.searchTracks')}>
        <select className="admin-input" value={albumFilter} onChange={(e) => { setAlbumFilter(e.target.value); list.setPage(1) }} aria-label={t('admin.allAlbums')}>
          <option value="all">{t('admin.allAlbums')}</option>
          {albumOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.titleTa || a.titleEn || a.id}
            </option>
          ))}
        </select>
        <select className="admin-input" value={genreFilter} onChange={(e) => { setGenreFilter(e.target.value); list.setPage(1) }} aria-label={t('admin.allGenres')}>
          <option value="all">{t('admin.allGenres')}</option>
          {GENRES.map((g) => (
            <option key={g} value={g}>{genreLabel(g)}</option>
          ))}
        </select>
        <select className="admin-input" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); list.setPage(1) }} aria-label={t('admin.allStatuses')}>
          <option value="all">{t('admin.allStatuses')}</option>
          {STATUS_VALUES.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
        <label className="admin-check-label">
          <input type="checkbox" checked={showDeleted} onChange={(e) => { setShowDeleted(e.target.checked); list.setPage(1) }} />
          {t('admin.statusDeleted')}
        </label>
      </AdminToolbar>

      <AdminBulkBar t={t} list={list}>
        <button type="button" className="admin-btn admin-btn-small" onClick={() => bulkSetStatus('published')}>
          {t('common.publish')}
        </button>
        <button type="button" className="admin-btn admin-btn-small" onClick={() => bulkSetStatus('unlisted')}>
          {t('common.unpublish')}
        </button>
        <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => list.setConfirmState({ kind: 'bulkDelete' })}>
          {t('admin.bulkDelete')}
        </button>
        <button type="button" className="admin-btn admin-btn-small admin-btn-ghost" onClick={() => list.clearSelection()}>
          {t('common.cancel')}
        </button>
      </AdminBulkBar>

      <AdminListContent
        t={t}
        list={list}
        loading={tracksLoading}
        empty={{
          title: t('admin.noTracksFound'),
          hint: t('admin.noTracksFoundHint'),
          actionLabel: t('admin.addFirstTrack'),
          onAction: () => navigate('/admin/tracks/new'),
        }}
      >
        <AdminTable
          list={list}
          selectAllLabel={t('admin.tracks')}
          columns={
            <>
              <AdminFirstColumns list={list} coverLabel={t('admin.cover')} sortKey="title" sortLabel={t('admin.title')} />
              <th scope="col" aria-sort={list.ariaSort('artist')}>{list.sortHeader('artist', t('admin.artist'))}</th>
              <th scope="col" aria-sort={list.ariaSort('album')}>{list.sortHeader('album', t('admin.album'))}</th>
              <th scope="col">{t('admin.genre')}</th>
              <th scope="col">{t('admin.status')}</th>
              <th scope="col" aria-sort={list.ariaSort('plays')}>{list.sortHeader('plays', t('admin.plays'))}</th>
              <th scope="col">{t('common.actions')}</th>
            </>
          }
        >
            {list.pageRows.map((tr) => (
              <tr key={tr.id}>
                <td>
                  <input type="checkbox" checked={list.selected.has(tr.id)} onChange={() => list.toggleSelect(tr.id)} aria-label={tr.titleTa || tr.titleEn || tr.id} />
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
                      <TrackActions t={t} tr={tr} isAdmin={isAdmin} onUnpublish={handleUnpublish} onDelete={handleDelete} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </AdminTable>
          <AdminCards>
            {list.pageRows.map((tr) => (
              <AdminCard
                key={tr.id}
                thumb={
                  tr.cover ? (
                    <img src={tr.cover} alt="" className="list-card-thumb" />
                  ) : (
                    <img src="/assets/nandha-logo.png" alt="" className="list-card-thumb" />
                  )
                }
                title={tr.titleTa || tr.titleEn || '—'}
                sub={
                  <>
                    {tr.titleEn && tr.titleTa ? tr.titleEn : ''}{tr.artist ? ` · ${tr.artist}` : ''}
                  </>
                }
                meta={
                  <>
                    <span className={`admin-badge admin-badge-${normalizeStatus(tr.status)}`}>
                      {statusLabel(tr.status)}
                    </span>
                    {normalizeStatus(tr.status) === 'scheduled' && (tr.scheduledAt || tr.releaseDate) && (
                      <span className="admin-cell-sub">{tr.scheduledAt || tr.releaseDate}</span>
                    )}
                  </>
                }
                menuLabel={`${t('common.actions')} — ${tr.titleTa || tr.titleEn || tr.id}`}
              >
                <TrackActions t={t} tr={tr} isAdmin={isAdmin} onUnpublish={handleUnpublish} onDelete={handleDelete} />
              </AdminCard>
            ))}
          </AdminCards>
      </AdminListContent>

      <AdminDeleteDialogs
        t={t}
        list={list}
        deleteTitle={t('admin.confirmDelete', { title: deleteTrack?.titleTa || deleteTrack?.titleEn || deleteTrack?.id || '' })}
        deleteBody={t('admin.deleteNoUndo')}
        onConfirmDelete={doDeleteTrack}
        onConfirmBulkDelete={doBulkDelete}
      />

      <AdminPagination t={t} list={list} />
    </div>
  )
}
