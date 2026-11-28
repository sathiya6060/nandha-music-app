// Curated playlists admin — CRUD with track add/remove + reorder.
// List scaffolding (search/sort/page/selection/delete) lives in the
// shared useAdminList hook + AdminList components.
import { useMemo, useState } from 'react'
import { tracks as catalogTracks, playlists as catalogPlaylists } from '../data/catalog.js'
import { useTracks, usePlaylists } from '../lib/supabaseCatalog.js'
import {
  supabaseWritesEnabled,
  savePlaylistToSupabase,
  deletePlaylistFromSupabase,
  adminErrorMessage,
  withTimeout,
  SAVE_TIMEOUT_MS,
} from '../lib/supabaseAdmin.js'
import { useToast } from '../lib/toast.jsx'
import { useAdminList } from './lib/useAdminList.jsx'
import { useOrderedTracks, useCoverFile } from './lib/useEditorForm.js'
import {
  AdminPageHead,
  AdminErrorNotice,
  AdminToolbar,
  AdminBulkBar,
  AdminListContent,
  AdminRowActions,
  AdminFormActions,
  AdminTrackOrderEditor,
  AdminTable,
  AdminCards,
  AdminCard,
  AdminPagination,
  AdminDeleteDialogs,
} from './components/AdminList.jsx'
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
  const cover = useCoverFile()
  const showToast = useToast()

  const mergedPlaylists = useMemo(() => getMergedPlaylists(sbPlaylists || catalogPlaylists), [version, sbPlaylists])
  const playlistName = (pl) => pl.name || pl.titleTa || pl.titleEn || ''
  const playlistTrackCount = (pl) => (Array.isArray(pl.trackIds) ? pl.trackIds.length : 0)
  const list = useAdminList({
    t,
    user,
    isAdmin,
    showToast,
    rows: mergedPlaylists,
    searchFilter: (pl, q) =>
      !q ||
      [pl.name, pl.titleTa, pl.titleEn, pl.description, pl.descriptionEn, pl.descriptionTa]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    sortValue: (pl, key) => {
      if (key === 'name') return playlistName(pl)
      if (key === 'count') return playlistTrackCount(pl)
      return ''
    },
    sortKind: (key) => (key === 'count' ? 'number' : 'text'),
    initialSort: { key: 'name', dir: 'asc' },
    bumpVersion: () => setVersion((v) => v + 1),
  })

  const startNew = () => {
    setEditing('new')
    setForm(EMPTY_PLAYLIST)
    cover.reset()
    list.setError('')
  }

  const startEdit = (playlist) => {
    // C5: never open the editor with an unloaded track list — the
    // save would treat "no tracks loaded" as "no tracks in playlist".
    if (tracksLoading) {
      list.setError(t('admin.tracksLoading'))
      return
    }
    setEditing(playlist.id)
    setForm({
      name: playlist.name || playlist.titleTa || playlist.titleEn || '',
      description: playlist.description || playlist.descriptionEn || playlist.descriptionTa || '',
      trackIds: Array.isArray(playlist.trackIds) ? [...playlist.trackIds] : [],
    })
    cover.setPreview(playlist.cover || '')
    list.setError('')
  }

  const { toggleTrack, doRemoveTrack, moveTrack } = useOrderedTracks({
    form,
    setForm,
    setConfirmState: list.setConfirmState,
  })

  const handleSave = async (e) => {
    e.preventDefault()
    // H3: defense in depth — RLS is the real gate.
    if (!isAdmin) {
      list.setError(t('admin.notAdmin'))
      return
    }
    if (!form.name.trim()) {
      list.setError(t('admin.playlistNameRequired'))
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
              cover: cover.preview && !cover.preview.startsWith('blob:') ? cover.preview : base.cover || null,
            },
            { coverFile: cover.file, trackIds: form.trackIds, trackIdsLoaded: !tracksLoading },
          ),
          SAVE_TIMEOUT_MS,
          'Playlist save',
        )
        // M4: tracks dropped from membership (unresolvable ids) are
        // reported, not silently lost.
        const droppedNote = savedPlaylist.droppedTrackIds?.length > 0
          ? ` ${t('admin.membershipDropped', { count: savedPlaylist.droppedTrackIds.length })}`
          : ''
        // Refetch BEFORE closing the editor: the list must hold the
        // saved order when the editor closes. Re-opening it on stale
        // data lost a Move-up (28 Nov 2026) — the move applied to
        // the old order and the save overwrote the fresh one.
        await refetchPlaylists()
        await refetchTracks()
        showToast(t('admin.saved') + droppedNote)
      } catch (err) {
        list.setError(err?.code === 'timeout' ? t('admin.saveTimeout') : adminErrorMessage(err, t))
        return
      }
      logActivity({ actor: user?.email || 'Admin', action: editing === 'new' ? 'Created playlist' : 'Updated playlist', detail: form.name })
      list.setError('')
      setEditing(null)
      cover.reset()
      list.bumpVersion()
      return
    }
    // Admin is Supabase-only (27 Nov 2026): no local fallback.
    list.setError(t('admin.dbNotConnected'))
  }

  // Playlist delete is a hard delete in the DB — no Undo toast is
  // offered (there is no soft-delete to undo from).
  const handleDelete = (playlist) => {
    list.setConfirmState({ kind: 'delete', item: playlist })
  }

  const doDeletePlaylist = (playlist) =>
    list.deleteOne({
      item: playlist,
      label: playlistName(playlist) || playlist.id,
      deleteFn: deletePlaylistFromSupabase,
      activity: 'Deleted playlist',
      refetch: refetchPlaylists,
    })

  const doBulkDelete = () =>
    list.deleteSelected({
      items: mergedPlaylists,
      getLabel: (pl) => playlistName(pl) || pl.id,
      deleteFn: deletePlaylistFromSupabase,
      activity: 'Bulk deleted playlists',
      bulkUnit: 'playlist(s)',
      refetch: refetchPlaylists,
    })

  const orderedTracks = form.trackIds.map((id) => adminTracks.find((tr) => tr.id === id)).filter(Boolean)
  const unselectedTracks = adminTracks.filter((tr) => !form.trackIds.includes(tr.id))
  const deletePlaylist = list.confirmState?.item

  return (
    <div className="admin-page">
      <AdminPageHead
        title={t('admin.playlists')}
        subtitle={`${list.sorted.length} ${t('admin.playlists')}`}
        newLabel={t('admin.newPlaylist')}
        onNew={startNew}
      />

      <AdminErrorNotice
        error={list.error}
        role="status"
        retryLabel={t('admin.fallbackRetry')}
        onRetry={() => {
          list.setError('')
          void refetchTracks()
          void refetchPlaylists()
        }}
      />

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
              <input className="admin-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-required="true" aria-invalid={Boolean(list.error)} />
            </label>
            <label className="admin-field">
              <span>{t('admin.coverFile')}</span>
              <input type="file" accept="image/*" className="admin-input" onChange={cover.onChange} />
              {cover.preview && <img src={cover.preview} alt="" className="admin-cover-preview" />}
            </label>
          </div>
          <label className="admin-field">
            <span>{t('admin.description')}</span>
            <textarea className="admin-input admin-textarea" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>

          <AdminTrackOrderEditor
            t={t}
            orderedTracks={orderedTracks}
            unselectedTracks={unselectedTracks}
            onMove={moveTrack}
            onToggle={toggleTrack}
          />

          <AdminFormActions t={t} saveLabel={t('admin.savePlaylist')} onCancel={() => setEditing(null)} />
        </form>
      )}

      <AdminToolbar t={t} list={list} searchPlaceholder={t('admin.searchPlaylists')} searchLabel={t('admin.searchPlaylists')} />

      <AdminBulkBar t={t} list={list} />

      <AdminListContent
        t={t}
        list={list}
        loading={tracksLoading || playlistsLoading}
        emptyTitle={t('admin.noPlaylistsFound')}
        emptyHint={t('admin.noTracksFoundHint')}
        emptyActionLabel={t('admin.addFirstPlaylist')}
        onEmptyAction={startNew}
      >
        <AdminTable
          list={list}
          selectAllLabel={t('admin.playlists')}
          columns={
            <>
              <th scope="col">{t('admin.cover')}</th>
              <th scope="col" aria-sort={list.ariaSort('name')}>{list.sortHeader('name', t('admin.title'))}</th>
              <th scope="col">{t('admin.description')}</th>
              <th scope="col" aria-sort={list.ariaSort('count')}>{list.sortHeader('count', t('admin.tracks'))}</th>
              <th scope="col">{t('common.actions')}</th>
            </>
          }
        >
          {list.pageRows.map((p) => (
            <tr key={p.id}>
              <td>
                <input type="checkbox" checked={list.selected.has(p.id)} onChange={() => list.toggleSelect(p.id)} aria-label={playlistName(p) || p.id} />
              </td>
              <td>{p.cover ? <img src={p.cover} alt="" className="admin-thumb" /> : <img src="/assets/nandha-logo.png" alt="" className="admin-thumb admin-thumb-logo" />}</td>
              <td><span className="admin-cell-main">{p.name || p.titleTa || p.titleEn || '—'}</span></td>
              <td className="admin-cell-truncate">{p.description || p.descriptionEn || p.descriptionTa || '—'}</td>
              <td>{Array.isArray(p.trackIds) ? p.trackIds.length : 0}</td>
              <td>
                <AdminRowActions t={t} onEdit={() => startEdit(p)} onDelete={() => handleDelete(p)} />
              </td>
            </tr>
          ))}
        </AdminTable>
        <AdminCards>
          {list.pageRows.map((p) => (
            <AdminCard
              key={p.id}
              thumb={
                p.cover ? (
                  <img src={p.cover} alt="" className="list-card-thumb" />
                ) : (
                  <img src="/assets/nandha-logo.png" alt="" className="list-card-thumb" />
                )
              }
              title={playlistName(p) || '—'}
              sub={p.description || p.descriptionEn || p.descriptionTa || ''}
              meta={
                <span className="admin-cell-sub">{playlistTrackCount(p)} {t('admin.tracks')}</span>
              }
              menuLabel={`${t('common.actions')} — ${playlistName(p) || p.id}`}
            >
              <AdminRowActions t={t} onEdit={() => startEdit(p)} onDelete={() => handleDelete(p)} />
            </AdminCard>
          ))}
        </AdminCards>
      </AdminListContent>

      <AdminPagination t={t} list={list} show={list.sorted.length > list.pageSize} />

      <AdminDeleteDialogs
        t={t}
        list={list}
        deleteTitle={t('admin.confirmDelete', { title: deletePlaylist ? playlistName(deletePlaylist) : '' })}
        deleteBody={t('admin.deleteNoUndo')}
        onConfirmDelete={doDeletePlaylist}
        onConfirmBulkDelete={doBulkDelete}
      />
      <ConfirmDialog
        open={list.confirmState?.kind === 'removeTrack'}
        title={t('admin.confirmRemoveTrack', { title: adminTracks.find((tr) => tr.id === list.confirmState?.trackId)?.titleTa || adminTracks.find((tr) => tr.id === list.confirmState?.trackId)?.titleEn || list.confirmState?.trackId || '' })}
        body={t('admin.deleteNoUndo')}
        confirmLabel={t('common.remove')}
        danger
        onConfirm={() => {
          const trackId = list.confirmState.trackId
          list.setConfirmState(null)
          doRemoveTrack(trackId)
        }}
        onCancel={() => list.setConfirmState(null)}
      />
    </div>
  )
}
