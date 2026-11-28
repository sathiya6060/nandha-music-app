// Curated playlists admin — CRUD with track add/remove + reorder.
import { useMemo, useState } from 'react'
import { tracks as catalogTracks, playlists as catalogPlaylists } from '../data/catalog.js'
import { useTracks, usePlaylists } from '../lib/supabaseCatalog.js'
import {
  supabaseWritesEnabled,
  savePlaylistToSupabase,
  deletePlaylistFromSupabase,
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
  getMergedPlaylists,
  logActivity,
} from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'
import FallbackBanner from './FallbackBanner.jsx'

const EMPTY_PLAYLIST = { name: '', description: '', trackIds: [] }

export default function PlaylistsAdmin() {
  const { user, isAdmin } = useAuth()
  const { t } = useI18n()
  // Supabase read layer (B1, admin sees all playlists); static catalog
  // + local overrides are the fallback.
  const { data: sbTracks, isLoading: tracksLoading, refetch: refetchTracks } = useTracks({ publishedOnly: false })
  const { data: sbPlaylists, isLoading: playlistsLoading, refetch: refetchPlaylists } = usePlaylists({ admin: true })
  const adminTracks = useMemo(
    () => getMergedTracks(sbTracks || catalogTracks).filter((tr) => tr.status !== 'deleted'),
    [sbTracks],
  )
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_PLAYLIST)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [error, setError] = useState('')
  const [confirmState, setConfirmState] = useState(null) // { kind: 'delete'|'bulkDelete'|'removeTrack', playlist?, trackId? }
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [selected, setSelected] = useState(new Set())
  const showToast = useToast()

  const mergedPlaylists = useMemo(() => getMergedPlaylists(sbPlaylists || catalogPlaylists), [version, sbPlaylists])
  const debouncedSearch = useDebouncedValue(search)
  const playlistName = (pl) => pl.name || pl.titleTa || pl.titleEn || ''
  const playlistTrackCount = (pl) => (Array.isArray(pl.trackIds) ? pl.trackIds.length : 0)
  const visiblePlaylists = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return mergedPlaylists
    return mergedPlaylists.filter((pl) => [pl.name, pl.titleTa, pl.titleEn, pl.description, pl.descriptionEn, pl.descriptionTa]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)))
  }, [mergedPlaylists, debouncedSearch])
  const playlistSortValue = (pl, key) => {
    if (key === 'name') return playlistName(pl)
    if (key === 'count') return playlistTrackCount(pl)
    return ''
  }
  const sortedPlaylists = useMemo(
    () => sortRows(visiblePlaylists, sort.key, sort.dir, playlistSortValue, sort.key === 'count' ? 'number' : 'text'),
    [visiblePlaylists, sort],
  )
  const playlistPageCount = pageCountFor(sortedPlaylists.length, pageSize)
  const playlistCurrentPage = clampPage(page, sortedPlaylists.length, pageSize)
  const pagePlaylists = paginateRows(sortedPlaylists, playlistCurrentPage, pageSize)
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
      const allSelected = pagePlaylists.every((pl) => next.has(pl.id))
      for (const pl of pagePlaylists) {
        if (allSelected) next.delete(pl.id)
        else next.add(pl.id)
      }
      return next
    })
  }

  const startNew = () => {
    setEditing('new')
    setForm(EMPTY_PLAYLIST)
    setCoverFile(null)
    setCoverPreview('')
    setError('')
  }

  const startEdit = (playlist) => {
    // C5: never open the editor with an unloaded track list — the
    // save would treat "no tracks loaded" as "no tracks in playlist".
    if (tracksLoading) {
      setError(t('admin.tracksLoading'))
      return
    }
    setEditing(playlist.id)
    setForm({
      name: playlist.name || playlist.titleTa || playlist.titleEn || '',
      description: playlist.description || playlist.descriptionEn || playlist.descriptionTa || '',
      trackIds: Array.isArray(playlist.trackIds) ? [...playlist.trackIds] : [],
    })
    setCoverPreview(playlist.cover || '')
    setError('')
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
    // H3: defense in depth — RLS is the real gate.
    if (!isAdmin) {
      setError(t('admin.notAdmin'))
      return
    }
    if (!form.name.trim()) {
      setError(t('admin.playlistNameRequired'))
      return
    }
    const base = editing === 'new' ? {} : mergedPlaylists.find((p) => p.id === editing) || {}
    // Supabase path (B1): cover -> "covers" bucket, row + track order
    // -> tables. A failed write shows a clear message — no silent
    // local fallback.
    if (supabaseWritesEnabled()) {
      try {
        // C6: same timeout wrapper as TrackEditor — a stalled DB
        // write must not hang the form on "Saving…" forever.
        const savedPlaylist = await withTimeout(
          savePlaylistToSupabase(
            {
              ...base,
              id: editing === 'new' ? undefined : editing,
              name: form.name.trim(),
              titleEn: form.name.trim(),
              description: form.description.trim(),
              descriptionEn: form.description.trim(),
              descriptionTa: form.description.trim(),
              cover: coverPreview && !coverPreview.startsWith('blob:') ? coverPreview : base.cover || null,
            },
            { coverFile, trackIds: form.trackIds, trackIdsLoaded: !tracksLoading },
          ),
          SAVE_TIMEOUT_MS,
          'Playlist save',
        )
        // M4: tracks dropped from membership (unresolvable ids) are
        // reported, not silently lost.
        const droppedNote = savedPlaylist.droppedTrackIds?.length > 0
          ? ` ${t('admin.membershipDropped', { count: savedPlaylist.droppedTrackIds.length })}`
          : ''
        showToast(t('admin.saved') + droppedNote)
      } catch (err) {
        setError(err?.code === 'timeout' ? t('admin.saveTimeout') : adminErrorMessage(err, t))
        return
      }
      logActivity({ actor: user?.email || 'Admin', action: editing === 'new' ? 'Created playlist' : 'Updated playlist', detail: form.name })
      setError('')
      setEditing(null)
      setCoverFile(null)
      setVersion((v) => v + 1)
      return
    }
    // Admin is Supabase-only (27 Nov 2026): no local fallback.
    setError(t('admin.dbNotConnected'))
  }

  // Playlist delete is a hard delete in the DB — no Undo toast is
  // offered (there is no soft-delete to undo from).
  const handleDelete = (playlist) => {
    setConfirmState({ kind: 'delete', playlist })
  }

  const doDeletePlaylist = async (playlist) => {
    const name = playlist.name || playlist.titleTa || playlist.titleEn || playlist.id
    // H3: defense in depth — RLS is the real gate.
    if (!isAdmin) {
      setError(t('admin.notAdmin'))
      return
    }
    setError('')
    if (supabaseWritesEnabled()) {
      try {
        await deletePlaylistFromSupabase(playlist)
      } catch (err) {
        setError(adminDeleteErrorMessage(err, t))
        return
      }
      logActivity({ actor: user?.email || 'Admin', action: 'Deleted playlist', detail: name })
      showToast(t('admin.itemDeleted', { title: name }))
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(playlist.id)
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
      const playlist = mergedPlaylists.find((pl) => pl.id === id)
      if (!playlist) {
        failed.push(id)
        continue
      }
      try {
        await deletePlaylistFromSupabase(playlist)
        done += 1
      } catch {
        failed.push(playlist.name || playlist.titleTa || playlist.titleEn || playlist.id)
      }
    }
    if (done > 0) {
      logActivity({ actor: user?.email || 'Admin', action: 'Bulk deleted playlists', detail: `${done} playlist(s)` })
      showToast(t('admin.bulkDeleteResult', { done, total: selected.size }))
    }
    if (failed.length > 0) {
      setError(t('admin.bulkDeleteFailed', { count: failed.length, titles: failed.join(', ') }))
    }
    setSelected(new Set())
    setVersion((v) => v + 1)
  }

  const orderedTracks = form.trackIds.map((id) => adminTracks.find((tr) => tr.id === id)).filter(Boolean)
  const unselectedTracks = adminTracks.filter((tr) => !form.trackIds.includes(tr.id))

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">{t('admin.playlists')}</h1>
          <p className="admin-subtitle">
            {sortedPlaylists.length} {t('admin.playlists')}
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={startNew}>
          {t('admin.newPlaylist')}
        </button>
      </div>

      {error && (
        <div className="admin-notice admin-notice-warn" role="status" aria-live="polite">
          {error}
          <button
            type="button"
            className="admin-btn admin-btn-small"
            onClick={() => {
              setError('')
              void refetchTracks()
              void refetchPlaylists()
            }}
            style={{ marginLeft: 12 }}
          >
            {t('admin.fallbackRetry')}
          </button>
        </div>
      )}

      <FallbackBanner
        loading={tracksLoading || playlistsLoading}
        onRetry={() => {
          void refetchTracks()
          void refetchPlaylists()
        }}
      />

      {editing !== null && (
        <form className="admin-form admin-panel" onSubmit={handleSave} noValidate>
          <h2 className="admin-panel-title">{editing === 'new' ? t('admin.newPlaylist') : t('admin.editPlaylist')}</h2>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>{t('admin.title')}</span>
              <input className="admin-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-required="true" aria-invalid={Boolean(error)} />
            </label>
            <label className="admin-field">
              <span>{t('admin.coverFile')}</span>
              <input type="file" accept="image/*" className="admin-input" onChange={onCoverChange} />
              {coverPreview && <img src={coverPreview} alt="" className="admin-cover-preview" />}
            </label>
          </div>
          <label className="admin-field">
            <span>{t('admin.description')}</span>
            <textarea className="admin-input admin-textarea" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>

          <h3 className="admin-section-title">{t('admin.trackOrder')}</h3>
          {orderedTracks.length === 0 ? (
            <p className="admin-muted">{t('admin.noTracksInList')}</p>
          ) : (
            <ol className="admin-order-list">
              {orderedTracks.map((tr, i) => (
                <li key={tr.id} className="admin-order-item">
                  <span>{i + 1}. {tr.titleTa || tr.titleEn}</span>
                  <span className="admin-order-actions">
                    <button type="button" className="admin-btn admin-btn-small" disabled={i === 0} onClick={() => moveTrack(i, -1)}>{t('common.moveUp')}</button>
                    <button type="button" className="admin-btn admin-btn-small" disabled={i === orderedTracks.length - 1} onClick={() => moveTrack(i, 1)}>{t('common.moveDown')}</button>
                    <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => toggleTrack(tr.id)}>{t('common.remove')}</button>
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
            <button type="submit" className="admin-btn admin-btn-primary">{t('admin.savePlaylist')}</button>
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
          </div>
        </form>
      )}

      <div className="admin-toolbar">
        <input
          type="search"
          className="admin-input admin-search"
          placeholder={t('admin.searchPlaylists')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          aria-label={t('admin.searchPlaylists')}
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

      {tracksLoading || playlistsLoading ? (
        <div className="list-skeleton" aria-busy="true" aria-label={t('admin.loadingRows')}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="list-skeleton-row" />
          ))}
        </div>
      ) : pagePlaylists.length === 0 ? (
        <div className="admin-empty">
          <h2>{t('admin.noPlaylistsFound')}</h2>
          <p>{t('admin.noTracksFoundHint')}</p>
          <button type="button" className="admin-btn admin-btn-primary" onClick={startNew}>
            {t('admin.addFirstPlaylist')}
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
                  checked={pagePlaylists.length > 0 && pagePlaylists.every((pl) => selected.has(pl.id))}
                  onChange={toggleSelectPage}
                  aria-label={t('admin.playlists')}
                />
              </th>
              <th scope="col">{t('admin.cover')}</th>
              <th scope="col" aria-sort={sort.key === 'name' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortHeader('name', t('admin.title'))}</th>
              <th scope="col">{t('admin.description')}</th>
              <th scope="col" aria-sort={sort.key === 'count' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortHeader('count', t('admin.tracks'))}</th>
              <th scope="col">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {pagePlaylists.map((p) => (
              <tr key={p.id}>
                <td>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} aria-label={playlistName(p) || p.id} />
                </td>
                <td>{p.cover ? <img src={p.cover} alt="" className="admin-thumb" /> : <img src="/assets/nandha-logo.png" alt="" className="admin-thumb admin-thumb-logo" />}</td>
                <td><span className="admin-cell-main">{p.name || p.titleTa || p.titleEn || '—'}</span></td>
                <td className="admin-cell-truncate">{p.description || p.descriptionEn || p.descriptionTa || '—'}</td>
                <td>{Array.isArray(p.trackIds) ? p.trackIds.length : 0}</td>
                <td>
                  <div className="admin-row-actions">
                    <button type="button" className="admin-btn admin-btn-small" onClick={() => startEdit(p)}>{t('common.edit')}</button>
                    <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => handleDelete(p)}>{t('common.delete')}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="list-cards">
          {pagePlaylists.map((p) => (
            <article key={p.id} className="list-card">
              {p.cover ? (
                <img src={p.cover} alt="" className="list-card-thumb" />
              ) : (
                <img src="/assets/nandha-logo.png" alt="" className="list-card-thumb" />
              )}
              <div className="list-card-body">
                <span className="list-card-title">{playlistName(p) || '—'}</span>
                <span className="list-card-sub">{p.description || p.descriptionEn || p.descriptionTa || ''}</span>
                <span className="list-card-meta">
                  <span className="admin-cell-sub">{playlistTrackCount(p)} {t('admin.tracks')}</span>
                </span>
              </div>
              <details className="list-card-menu">
                <summary aria-label={`${t('common.actions')} — ${playlistName(p) || p.id}`}>⋯</summary>
                <div className="list-card-menu-actions">
                  <button type="button" className="admin-btn admin-btn-small" onClick={() => startEdit(p)}>{t('common.edit')}</button>
                  <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => handleDelete(p)}>{t('common.delete')}</button>
                </div>
              </details>
            </article>
          ))}
        </div>
        </>
      )}

      {sortedPlaylists.length > pageSize && (
        <div className="admin-pagination">
          <button type="button" className="admin-btn admin-btn-small" disabled={playlistCurrentPage <= 1} onClick={() => setPage(playlistCurrentPage - 1)}>
            {t('common.previous')}
          </button>
          <span>{t('common.pageOf', { page: playlistCurrentPage, total: playlistPageCount })}</span>
          <button type="button" className="admin-btn admin-btn-small" disabled={playlistCurrentPage >= playlistPageCount} onClick={() => setPage(playlistCurrentPage + 1)}>
            {t('common.next')}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmState?.kind === 'delete'}
        title={t('admin.confirmDelete', { title: confirmState?.playlist ? playlistName(confirmState.playlist) : '' })}
        body={t('admin.deleteNoUndo')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          const playlist = confirmState.playlist
          setConfirmState(null)
          void doDeletePlaylist(playlist)
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
