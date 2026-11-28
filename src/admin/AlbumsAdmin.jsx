// Albums admin — list + create/edit with track ordering.
import { useMemo, useState } from 'react'
import { tracks as catalogTracks, albums as catalogAlbums } from '../data/catalog.js'
import { useTracks, useAlbums } from '../lib/supabaseCatalog.js'
import {
  supabaseWritesEnabled,
  saveAlbumToSupabase,
  deleteAlbumFromSupabase,
  adminErrorMessage,
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
  getMergedAlbums,
  logActivity,
} from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'
import FallbackBanner from './FallbackBanner.jsx'

const EMPTY_ALBUM = { titleTa: '', titleEn: '', releaseDate: '', trackIds: [] }

export default function AlbumsAdmin() {
  const { user, isAdmin } = useAuth()
  const { t } = useI18n()
  // Supabase read layer (B1, all statuses for admin); static catalog +
  // local overrides are the fallback.
  const { data: sbTracks, isLoading: tracksLoading, refetch: refetchTracks } = useTracks({ publishedOnly: false })
  const { data: sbAlbums, isLoading: albumsLoading, refetch: refetchAlbums } = useAlbums()
  const adminTracks = useMemo(() => getMergedTracks(sbTracks || catalogTracks), [sbTracks])
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState(null) // album id or 'new'
  const [form, setForm] = useState(EMPTY_ALBUM)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [error, setError] = useState('')
  const [confirmState, setConfirmState] = useState(null) // { kind: 'delete'|'bulkDelete'|'removeTrack', album?, trackId? }
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ key: 'title', dir: 'asc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [selected, setSelected] = useState(new Set())
  const showToast = useToast()

  const mergedAlbums = useMemo(() => getMergedAlbums(sbAlbums || catalogAlbums), [version, sbAlbums])
  const debouncedSearch = useDebouncedValue(search)
  const albumTrackCount = (a) => (Array.isArray(a.trackIds)
    ? a.trackIds.length
    : adminTracks.filter((tr) => tr.albumId === a.id).length)
  const visibleAlbums = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return mergedAlbums
    return mergedAlbums.filter((a) => [a.titleTa, a.titleEn]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)))
  }, [mergedAlbums, debouncedSearch])
  const albumSortValue = (a, key) => {
    if (key === 'title') return a.titleTa || a.titleEn || ''
    if (key === 'releaseDate') return a.releaseDate || ''
    return ''
  }
  const sortedAlbums = useMemo(
    () => sortRows(visibleAlbums, sort.key, sort.dir, albumSortValue, sort.key === 'releaseDate' ? 'date' : 'text'),
    [visibleAlbums, sort],
  )
  const albumPageCount = pageCountFor(sortedAlbums.length, pageSize)
  const albumCurrentPage = clampPage(page, sortedAlbums.length, pageSize)
  const pageAlbums = paginateRows(sortedAlbums, albumCurrentPage, pageSize)
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
      const allSelected = pageAlbums.every((a) => next.has(a.id))
      for (const a of pageAlbums) {
        if (allSelected) next.delete(a.id)
        else next.add(a.id)
      }
      return next
    })
  }

  const startNew = () => {
    setEditing('new')
    setForm(EMPTY_ALBUM)
    setCoverFile(null)
    setCoverPreview('')
    setError('')
  }

  const startEdit = (album) => {
    // C5: never derive the edit's track list from the 1-track static
    // fallback while the real list is still loading — wait instead.
    if (tracksLoading) {
      setError(t('admin.tracksLoading'))
      return
    }
    setEditing(album.id)
    setForm({
      titleTa: album.titleTa || '',
      titleEn: album.titleEn || '',
      releaseDate: album.releaseDate || '',
      trackIds: Array.isArray(album.trackIds)
        ? [...album.trackIds]
        : adminTracks.filter((tr) => tr.albumId === album.id).map((tr) => tr.id),
    })
    setCoverPreview(album.cover || '')
  }

  const toggleTrack = (trackId) => {
    // L33: removing a track from the list is destructive — confirm it.
    if (form.trackIds.includes(trackId)) {
      setConfirmState({ kind: 'removeTrack', trackId })
      return
    }
    setForm((f) => ({
      ...f,
      trackIds: f.trackIds.includes(trackId)
        ? f.trackIds.filter((id) => id !== trackId)
        : [...f.trackIds, trackId],
    }))
  }

  const doRemoveTrack = (trackId) => {
    setForm((f) => ({ ...f, trackIds: f.trackIds.filter((id) => id !== trackId) }))
  }

  const moveTrack = (index, dir) => {
    setForm((f) => {
      const ids = [...f.trackIds]
      const target = index + dir
      if (target < 0 || target >= ids.length) return f
      ;[ids[index], ids[target]] = [ids[target], ids[index]]
      return { ...f, trackIds: ids }
    })
  }

  const onCoverChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverFile(file)
    if (coverPreview && coverPreview.startsWith('blob:')) URL.revokeObjectURL(coverPreview)
    setCoverPreview(URL.createObjectURL(file))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    // H3: defense in depth — RLS is the real gate.
    if (!isAdmin) {
      setError(t('admin.notAdmin'))
      return
    }
    // M30: an album needs a title.
    if (!form.titleTa.trim() && !form.titleEn.trim()) {
      setError(t('admin.titleRequired'))
      return
    }
    const base = editing === 'new' ? {} : mergedAlbums.find((a) => a.id === editing) || {}
    // Supabase path (B1): cover -> "covers" bucket, row + track
    // membership -> tables. A failed write shows a clear message
    // and does NOT fall back to localStorage.
    if (supabaseWritesEnabled()) {
      try {
        // C6: same timeout wrapper as TrackEditor — a stalled DB
        // write must not hang the form on "Saving…" forever.
        const savedAlbum = await withTimeout(
          saveAlbumToSupabase(
            {
              ...base,
              id: editing === 'new' ? undefined : editing,
              titleTa: form.titleTa.trim(),
              titleEn: form.titleEn.trim(),
              releaseDate: form.releaseDate || null,
              cover: coverPreview && !coverPreview.startsWith('blob:') ? coverPreview : base.cover || null,
            },
            { coverFile, trackIds: form.trackIds, trackIdsLoaded: !tracksLoading },
          ),
          SAVE_TIMEOUT_MS,
          'Album save',
        )
        // M4: tracks dropped from membership (unresolvable ids) are
        // reported, not silently lost.
        const droppedNote = savedAlbum.droppedTrackIds?.length > 0
          ? ` ${t('admin.membershipDropped', { count: savedAlbum.droppedTrackIds.length })}`
          : ''
        showToast(t('admin.saved') + droppedNote)
      } catch (err) {
        setError(err?.code === 'timeout' ? t('admin.saveTimeout') : adminErrorMessage(err, t))
        return
      }
      logActivity({ actor: user?.email || 'Admin', action: editing === 'new' ? 'Created album' : 'Updated album', detail: form.titleTa || form.titleEn })
      setEditing(null)
      setCoverFile(null)
      setVersion((v) => v + 1)
      return
    }
    // Admin is Supabase-only (27 Nov 2026): no local fallback.
    setError(t('admin.dbNotConnected'))
  }

  // Album delete is a hard delete in the DB — no Undo toast is
  // offered (there is no soft-delete to undo from).
  const handleDelete = (album) => {
    setConfirmState({ kind: 'delete', album })
  }

  const doDeleteAlbum = async (album) => {
    const title = album.titleTa || album.titleEn || album.id
    // H3: defense in depth — RLS is the real gate.
    if (!isAdmin) {
      setError(t('admin.notAdmin'))
      return
    }
    setError('')
    if (supabaseWritesEnabled()) {
      try {
        await deleteAlbumFromSupabase(album)
      } catch (err) {
        setError(adminDeleteErrorMessage(err, t))
        return
      }
      logActivity({ actor: user?.email || 'Admin', action: 'Deleted album', detail: title })
      showToast(t('admin.itemDeleted', { title }))
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(album.id)
        return next
      })
      setVersion((v) => v + 1)
      return
    }
    // Admin is Supabase-only (27 Nov 2026): no local fallback.
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
      const album = mergedAlbums.find((a) => a.id === id)
      if (!album) {
        failed.push(id)
        continue
      }
      try {
        await deleteAlbumFromSupabase(album)
        done += 1
      } catch {
        failed.push(album.titleTa || album.titleEn || album.id)
      }
    }
    if (done > 0) {
      logActivity({ actor: user?.email || 'Admin', action: 'Bulk deleted albums', detail: `${done} album(s)` })
      showToast(t('admin.bulkDeleteResult', { done, total: selected.size }))
    }
    if (failed.length > 0) {
      setError(t('admin.bulkDeleteFailed', { count: failed.length, titles: failed.join(', ') }))
    }
    setSelected(new Set())
    setVersion((v) => v + 1)
  }

  const orderedTracks = form.trackIds
    .map((id) => adminTracks.find((tr) => tr.id === id))
    .filter(Boolean)
  const unselectedTracks = adminTracks.filter((tr) => !form.trackIds.includes(tr.id) && tr.status !== 'deleted')

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">{t('admin.albums')}</h1>
          <p className="admin-subtitle">
            {sortedAlbums.length} {t('admin.albums')}
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={startNew}>
          {t('admin.newAlbum')}
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

      {editing !== null && (
        <form className="admin-form admin-panel" onSubmit={handleSave}>
          <h2 className="admin-panel-title">{editing === 'new' ? t('admin.newAlbum') : t('admin.editAlbum')}</h2>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>{t('admin.titleTa')}</span>
              <input className="admin-input" value={form.titleTa} onChange={(e) => setForm({ ...form, titleTa: e.target.value })} />
            </label>
            <label className="admin-field">
              <span>{t('admin.titleEn')}</span>
              <input className="admin-input" value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
            </label>
            <label className="admin-field">
              <span>{t('admin.releaseDate')}</span>
              <input type="date" className="admin-input" value={form.releaseDate} onChange={(e) => setForm({ ...form, releaseDate: e.target.value })} />
            </label>
            <label className="admin-field">
              <span>{t('admin.coverFile')}</span>
              <input type="file" accept="image/*" className="admin-input" onChange={onCoverChange} />
              {coverPreview && <img src={coverPreview} alt="" className="admin-cover-preview" />}
            </label>
          </div>

          <h3 className="admin-section-title">{t('admin.trackOrder')}</h3>
          {orderedTracks.length === 0 ? (
            <p className="admin-muted">{t('admin.noTracksInList')}</p>
          ) : (
            <ol className="admin-order-list">
              {orderedTracks.map((tr, i) => (
                <li key={tr.id} className="admin-order-item">
                  <span>{i + 1}. {tr.titleTa || tr.titleEn}</span>
                  <span className="admin-order-actions">
                    <button type="button" className="admin-btn admin-btn-small" disabled={i === 0} onClick={() => moveTrack(i, -1)}>
                      {t('common.moveUp')}
                    </button>
                    <button type="button" className="admin-btn admin-btn-small" disabled={i === orderedTracks.length - 1} onClick={() => moveTrack(i, 1)}>
                      {t('common.moveDown')}
                    </button>
                    <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => toggleTrack(tr.id)}>
                      {t('common.remove')}
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}

          <h3 className="admin-section-title">{t('admin.addTracks')}</h3>
          <div className="admin-checkbox-grid">
            {unselectedTracks.map((tr) => (
              <label key={tr.id} className="admin-check-label">
                <input type="checkbox" checked={false} onChange={() => toggleTrack(tr.id)} />
                {tr.titleTa || tr.titleEn} <span className="admin-muted">({tr.artist || '—'})</span>
              </label>
            ))}
          </div>

          <div className="admin-form-actions">
            <button type="submit" className="admin-btn admin-btn-primary">{t('admin.saveAlbum')}</button>
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
          </div>
        </form>
      )}

      <div className="admin-toolbar">
        <input
          type="search"
          className="admin-input admin-search"
          placeholder={t('admin.searchAlbums')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          aria-label={t('admin.searchAlbums')}
        />
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
          <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => setConfirmState({ kind: 'bulkDelete' })}>
            {t('admin.bulkDelete')}
          </button>
          <button type="button" className="admin-btn admin-btn-small admin-btn-ghost" onClick={() => setSelected(new Set())}>
            {t('common.cancel')}
          </button>
        </div>
      )}

      {tracksLoading || albumsLoading ? (
        <div className="list-skeleton" aria-busy="true" aria-label={t('admin.loadingRows')}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="list-skeleton-row" />
          ))}
        </div>
      ) : pageAlbums.length === 0 ? (
        <div className="admin-empty">
          <h2>{t('admin.noAlbumsFound')}</h2>
          <p>{t('admin.noTracksFoundHint')}</p>
          <button type="button" className="admin-btn admin-btn-primary" onClick={startNew}>
            {t('admin.addFirstAlbum')}
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
                  checked={pageAlbums.length > 0 && pageAlbums.every((a) => selected.has(a.id))}
                  onChange={toggleSelectPage}
                  aria-label={t('admin.albums')}
                />
              </th>
              <th scope="col">{t('admin.cover')}</th>
              <th scope="col" aria-sort={sort.key === 'title' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortHeader('title', t('admin.title'))}</th>
              <th scope="col" aria-sort={sort.key === 'releaseDate' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortHeader('releaseDate', t('admin.releaseDate'))}</th>
              <th scope="col">{t('admin.tracks')}</th>
              <th scope="col">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {pageAlbums.map((a) => {
              const count = albumTrackCount(a)
              return (
                <tr key={a.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} aria-label={a.titleTa || a.titleEn || a.id} />
                  </td>
                  <td>{a.cover ? <img src={a.cover} alt="" className="admin-thumb" /> : <img src="/assets/nandha-logo.png" alt="" className="admin-thumb admin-thumb-logo" />}</td>
                  <td>
                    <span className="admin-cell-main">{a.titleTa || '—'}</span>
                    <span className="admin-cell-sub">{a.titleEn || ''}</span>
                  </td>
                  <td>{a.releaseDate || '—'}</td>
                  <td>{count}</td>
                  <td>
                    <div className="admin-row-actions">
                      <button type="button" className="admin-btn admin-btn-small" onClick={() => startEdit(a)}>{t('common.edit')}</button>
                      <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => handleDelete(a)}>{t('common.delete')}</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        <div className="list-cards">
          {pageAlbums.map((a) => (
            <article key={a.id} className="list-card">
              {a.cover ? (
                <img src={a.cover} alt="" className="list-card-thumb" />
              ) : (
                <img src="/assets/nandha-logo.png" alt="" className="list-card-thumb" />
              )}
              <div className="list-card-body">
                <span className="list-card-title">{a.titleTa || a.titleEn || '—'}</span>
                <span className="list-card-sub">{a.titleEn && a.titleTa ? a.titleEn : ''}</span>
                <span className="list-card-meta">
                  <span className="admin-cell-sub">{a.releaseDate || '—'} · {albumTrackCount(a)} {t('admin.tracks')}</span>
                </span>
              </div>
              <details className="list-card-menu">
                <summary aria-label={`${t('common.actions')} — ${a.titleTa || a.titleEn || a.id}`}>⋯</summary>
                <div className="list-card-menu-actions">
                  <button type="button" className="admin-btn admin-btn-small" onClick={() => startEdit(a)}>{t('common.edit')}</button>
                  <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => handleDelete(a)}>{t('common.delete')}</button>
                </div>
              </details>
            </article>
          ))}
        </div>
        </>
      )}

      {sortedAlbums.length > pageSize && (
        <div className="admin-pagination">
          <button type="button" className="admin-btn admin-btn-small" disabled={albumCurrentPage <= 1} onClick={() => setPage(albumCurrentPage - 1)}>
            {t('common.previous')}
          </button>
          <span>{t('common.pageOf', { page: albumCurrentPage, total: albumPageCount })}</span>
          <button type="button" className="admin-btn admin-btn-small" disabled={albumCurrentPage >= albumPageCount} onClick={() => setPage(albumCurrentPage + 1)}>
            {t('common.next')}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmState?.kind === 'delete'}
        title={t('admin.confirmDelete', { title: confirmState?.album?.titleTa || confirmState?.album?.titleEn || confirmState?.album?.id || '' })}
        body={confirmState?.album ? t('admin.albumDeleteImpact', { tracks: albumTrackCount(confirmState.album) }) : ''}
        confirmLabel={t('common.delete')}
        danger
        requireTypeName={confirmState?.album ? (confirmState.album.titleTa || confirmState.album.titleEn || confirmState.album.id) : null}
        onConfirm={() => {
          const album = confirmState.album
          setConfirmState(null)
          void doDeleteAlbum(album)
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
      <ConfirmDialog
        open={confirmState?.kind === 'removeTrack'}
        title={t('admin.confirmRemoveTrack', { title: adminTracks.find((tr) => tr.id === confirmState?.trackId)?.titleTa || adminTracks.find((tr) => tr.id === confirmState?.trackId)?.titleEn || confirmState?.trackId || '' })}
        body={t('admin.deleteNoUndo')}
        confirmLabel={t('common.remove')}
        danger
        onConfirm={() => {
          const trackId = confirmState.trackId
          setConfirmState(null)
          doRemoveTrack(trackId)
        }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  )
}
