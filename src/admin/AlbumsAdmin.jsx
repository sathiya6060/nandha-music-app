// Albums admin — list + create/edit with track ordering.
// List scaffolding (search/sort/page/selection/delete) lives in the
// shared useAdminList hook + AdminList components.
import { useMemo, useState } from 'react'
import { tracks as catalogTracks, albums as catalogAlbums } from '../data/catalog.js'
import { useTracks, useAlbums } from '../lib/supabaseCatalog.js'
import {
  supabaseWritesEnabled,
  saveAlbumToSupabase,
  deleteAlbumFromSupabase,
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
  AdminFirstColumns,
  AdminRowActions,
  AdminTrackOrderForm,
  AdminRemoveTrackDialog,
  AdminTable,
  AdminCards,
  AdminCard,
  AdminPagination,
  AdminDeleteDialogs,
} from './components/AdminList.jsx'
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
  const cover = useCoverFile()
  const showToast = useToast()

  const mergedAlbums = useMemo(() => getMergedAlbums(sbAlbums || catalogAlbums), [version, sbAlbums])
  const albumTrackCount = (a) => (Array.isArray(a.trackIds)
    ? a.trackIds.length
    : adminTracks.filter((tr) => tr.albumId === a.id).length)
  const list = useAdminList({
    t,
    user,
    isAdmin,
    showToast,
    rows: mergedAlbums,
    searchFilter: (a, q) =>
      !q ||
      [a.titleTa, a.titleEn]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    sortValue: (a, key) => {
      if (key === 'title') return a.titleTa || a.titleEn || ''
      if (key === 'releaseDate') return a.releaseDate || ''
      return ''
    },
    sortKind: (key) => (key === 'releaseDate' ? 'date' : 'text'),
    initialSort: { key: 'title', dir: 'asc' },
    bumpVersion: () => setVersion((v) => v + 1),
  })

  const startNew = () => {
    setEditing('new')
    setForm(EMPTY_ALBUM)
    cover.reset()
    list.setError('')
  }

  const startEdit = (album) => {
    // C5: never derive the edit's track list from the 1-track static
    // fallback while the real list is still loading — wait instead.
    if (tracksLoading) {
      list.setError(t('admin.tracksLoading'))
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
    cover.setPreview(album.cover || '')
  }

  const { toggleTrack, doRemoveTrack, moveTrack } = useOrderedTracks({
    form,
    setForm,
    setConfirmState: list.setConfirmState,
  })

  const handleSave = async (e) => {
    e.preventDefault()
    list.setError('')
    // H3: defense in depth — RLS is the real gate.
    if (!isAdmin) {
      list.setError(t('admin.notAdmin'))
      return
    }
    // M30: an album needs a title.
    if (!form.titleTa.trim() && !form.titleEn.trim()) {
      list.setError(t('admin.titleRequired'))
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
              cover: cover.preview && !cover.preview.startsWith('blob:') ? cover.preview : base.cover || null,
            },
            { coverFile: cover.file, trackIds: form.trackIds, trackIdsLoaded: !tracksLoading },
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
        list.setError(err?.code === 'timeout' ? t('admin.saveTimeout') : adminErrorMessage(err, t))
        return
      }
      logActivity({ actor: user?.email || 'Admin', action: editing === 'new' ? 'Created album' : 'Updated album', detail: form.titleTa || form.titleEn })
      setEditing(null)
      cover.reset()
      list.bumpVersion()
      return
    }
    // Admin is Supabase-only (27 Nov 2026): no local fallback.
    list.setError(t('admin.dbNotConnected'))
  }

  // Album delete is a hard delete in the DB — no Undo toast is
  // offered (there is no soft-delete to undo from).
  const handleDelete = (album) => {
    list.setConfirmState({ kind: 'delete', item: album })
  }

  // No refetch after an album delete (unlike Tracks/Playlists) — the
  // version bump re-reads the merged list, as before.
  const doDeleteAlbum = (album) =>
    list.deleteOne({
      item: album,
      label: album.titleTa || album.titleEn || album.id,
      deleteFn: deleteAlbumFromSupabase,
      activity: 'Deleted album',
    })

  const doBulkDelete = () =>
    list.deleteSelected({
      items: mergedAlbums,
      getLabel: (a) => a.titleTa || a.titleEn || a.id,
      deleteFn: deleteAlbumFromSupabase,
      activity: 'Bulk deleted albums',
      bulkUnit: 'album(s)',
    })

  const orderedTracks = form.trackIds
    .map((id) => adminTracks.find((tr) => tr.id === id))
    .filter(Boolean)
  const unselectedTracks = adminTracks.filter((tr) => !form.trackIds.includes(tr.id) && tr.status !== 'deleted')
  const deleteAlbum = list.confirmState?.item

  return (
    <div className="admin-page">
      <AdminPageHead
        title={t('admin.albums')}
        subtitle={`${list.sorted.length} ${t('admin.albums')}`}
        newLabel={t('admin.newAlbum')}
        onNew={startNew}
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
              <input type="file" accept="image/*" className="admin-input" onChange={cover.onChange} />
              {cover.preview && <img src={cover.preview} alt="" className="admin-cover-preview" />}
            </label>
          </div>

          <AdminTrackOrderForm
            t={t}
            orderedTracks={orderedTracks}
            unselectedTracks={unselectedTracks}
            onMove={moveTrack}
            onToggle={toggleTrack}
            saveLabel={t('admin.saveAlbum')}
            onCancel={() => setEditing(null)}
          />
        </form>
      )}

      <AdminToolbar t={t} list={list} searchPlaceholder={t('admin.searchAlbums')} searchLabel={t('admin.searchAlbums')} />

      <AdminBulkBar t={t} list={list} />

      <AdminListContent
        t={t}
        list={list}
        loading={tracksLoading || albumsLoading}
        empty={{
          title: t('admin.noAlbumsFound'),
          hint: t('admin.noTracksFoundHint'),
          actionLabel: t('admin.addFirstAlbum'),
          onAction: startNew,
        }}
      >
        <AdminTable
          list={list}
          selectAllLabel={t('admin.albums')}
          columns={
            <>
              <AdminFirstColumns list={list} coverLabel={t('admin.cover')} sortKey="title" sortLabel={t('admin.title')} />
              <th scope="col" aria-sort={list.ariaSort('releaseDate')}>{list.sortHeader('releaseDate', t('admin.releaseDate'))}</th>
              <th scope="col">{t('admin.tracks')}</th>
              <th scope="col">{t('common.actions')}</th>
            </>
          }
        >
          {list.pageRows.map((a) => {
            const count = albumTrackCount(a)
            return (
              <tr key={a.id}>
                <td>
                  <input type="checkbox" checked={list.selected.has(a.id)} onChange={() => list.toggleSelect(a.id)} aria-label={a.titleTa || a.titleEn || a.id} />
                </td>
                <td>{a.cover ? <img src={a.cover} alt="" className="admin-thumb" /> : <img src="/assets/nandha-logo.png" alt="" className="admin-thumb admin-thumb-logo" />}</td>
                <td>
                  <span className="admin-cell-main">{a.titleTa || '—'}</span>
                  <span className="admin-cell-sub">{a.titleEn || ''}</span>
                </td>
                <td>{a.releaseDate || '—'}</td>
                <td>{count}</td>
                <td>
                  <AdminRowActions t={t} onEdit={() => startEdit(a)} onDelete={() => handleDelete(a)} />
                </td>
              </tr>
            )
          })}
        </AdminTable>
        <AdminCards>
          {list.pageRows.map((a) => (
            <AdminCard
              key={a.id}
              thumb={
                a.cover ? (
                  <img src={a.cover} alt="" className="list-card-thumb" />
                ) : (
                  <img src="/assets/nandha-logo.png" alt="" className="list-card-thumb" />
                )
              }
              title={a.titleTa || a.titleEn || '—'}
              sub={a.titleEn && a.titleTa ? a.titleEn : ''}
              meta={
                <span className="admin-cell-sub">{a.releaseDate || '—'} · {albumTrackCount(a)} {t('admin.tracks')}</span>
              }
              menuLabel={`${t('common.actions')} — ${a.titleTa || a.titleEn || a.id}`}
            >
              <AdminRowActions t={t} onEdit={() => startEdit(a)} onDelete={() => handleDelete(a)} />
            </AdminCard>
          ))}
        </AdminCards>
      </AdminListContent>

      <AdminPagination t={t} list={list} show={list.sorted.length > list.pageSize} />

      <AdminDeleteDialogs
        t={t}
        list={list}
        deleteTitle={t('admin.confirmDelete', { title: deleteAlbum?.titleTa || deleteAlbum?.titleEn || deleteAlbum?.id || '' })}
        deleteBody={deleteAlbum ? t('admin.albumDeleteImpact', { tracks: albumTrackCount(deleteAlbum) }) : ''}
        requireTypeName={deleteAlbum ? (deleteAlbum.titleTa || deleteAlbum.titleEn || deleteAlbum.id) : null}
        onConfirmDelete={doDeleteAlbum}
        onConfirmBulkDelete={doBulkDelete}
      />
      <AdminRemoveTrackDialog t={t} list={list} tracks={adminTracks} onRemoveTrack={doRemoveTrack} />
    </div>
  )
}
