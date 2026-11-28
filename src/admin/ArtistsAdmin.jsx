// Artists admin — list + editor (photo, bilingual bio, social links).
// List scaffolding (search/sort/page/selection/delete) lives in the
// shared useAdminList hook + AdminList components.
import { useMemo, useState } from 'react'
import { artists } from '../data/catalog.js'
import { useArtists } from '../lib/supabaseCatalog.js'
import {
  supabaseWritesEnabled,
  saveArtistToSupabase,
  deleteArtistFromSupabase,
  countArtistDependents,
  adminErrorMessage,
  adminDeleteErrorMessage,
  withTimeout,
  SAVE_TIMEOUT_MS,
} from '../lib/supabaseAdmin.js'
import { useToast } from '../lib/toast.jsx'
import { useAdminList } from './lib/useAdminList.jsx'
import { useCoverFile } from './lib/useEditorForm.js'
import {
  AdminPageHead,
  AdminErrorNotice,
  AdminToolbar,
  AdminBulkBar,
  AdminListContent,
  AdminRowActions,
  AdminFormActions,
  AdminTable,
  AdminCards,
  AdminCard,
  AdminPagination,
  AdminDeleteDialogs,
} from './components/AdminList.jsx'
import './lists.css'
import {
  getMergedArtists,
  saveAdminArtist,
  logActivity,
  invalidateCaches,
} from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'
import FallbackBanner from './FallbackBanner.jsx'

const EMPTY_ARTIST = {
  name: '',
  nameTa: '',
  bioTa: '',
  bioEn: '',
  instagram: '',
  youtube: '',
  facebook: '',
  threads: '',
  spotify: '',
  website: '',
}

export default function ArtistsAdmin() {
  const { user, isAdmin } = useAuth()
  const { t } = useI18n()
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_ARTIST)
  const photo = useCoverFile()
  const showToast = useToast()

  // Supabase read layer (B1); static catalog + local overrides are
  // the fallback.
  const { data: sbArtists, isLoading: artistsLoading, refetch: refetchArtists } = useArtists()
  const mergedArtists = useMemo(() => getMergedArtists(sbArtists || artists), [version, sbArtists])
  const artistName = (a) => a.nameTa || a.name || a.nameEn || ''
  const list = useAdminList({
    t,
    user,
    isAdmin,
    showToast,
    rows: mergedArtists,
    searchFilter: (a, q) =>
      !q ||
      [a.name, a.nameTa, a.nameEn, a.bioEn, a.bioTa]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    sortValue: (a) => artistName(a),
    sortKind: () => 'text',
    initialSort: { key: 'name', dir: 'asc' },
    bumpVersion: () => setVersion((v) => v + 1),
  })

  const startNew = () => {
    setEditing('new')
    setForm(EMPTY_ARTIST)
    photo.reset()
    list.setError('')
  }

  const startEdit = (artist) => {
    setEditing(artist.id)
    const socials = artist.socials || {}
    setForm({
      name: artist.name || artist.nameEn || '',
      nameTa: artist.nameTa || '',
      bioTa: artist.bioTa || '',
      bioEn: artist.bioEn || '',
      instagram: socials.instagram || artist.instagram || '',
      youtube: socials.youtube || artist.youtube || '',
      facebook: socials.facebook || artist.facebook || '',
      threads: socials.threads || artist.threads || '',
      spotify: socials.spotify || artist.spotify || '',
      website: socials.website || artist.website || '',
    })
    photo.reset()
    photo.setPreview(artist.photo || artist.image || '')
    list.setError('')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    // H3: defense in depth — RLS is the real gate.
    if (!isAdmin) {
      list.setError(t('admin.notAdmin'))
      return
    }
    if (!form.name.trim() && !form.nameTa.trim()) {
      list.setError(t('admin.artistNameRequired'))
      return
    }
    const base = editing === 'new' ? {} : mergedArtists.find((a) => a.id === editing) || {}
    const socials = {
      instagram: form.instagram.trim(),
      youtube: form.youtube.trim(),
      facebook: form.facebook.trim(),
      threads: form.threads.trim(),
      spotify: form.spotify.trim(),
      website: form.website.trim(),
    }
    // Supabase path (B1): row -> artists table, photo -> "covers"
    // bucket. The artists table has NO photo column, so the uploaded
    // photo URL is kept as a local override (merged over the DB row).
    // A failed write shows a clear message — no silent local fallback.
    if (supabaseWritesEnabled()) {
      try {
        // C6: same timeout wrapper as TrackEditor — a stalled DB
        // write must not hang the form on "Saving…" forever.
        const { id, photoUrl } = await withTimeout(
          saveArtistToSupabase(
            {
              ...base,
              id: editing === 'new' ? undefined : editing,
              name: form.name.trim(),
              nameTa: form.nameTa.trim(),
              bioTa: form.bioTa.trim(),
              bioEn: form.bioEn.trim(),
              socials,
            },
            { photoFile: photo.file },
          ),
          SAVE_TIMEOUT_MS,
          'Artist save',
        )
        // Local photo override only (artists table has no photo
        // column). A localStorage failure here must not report a
        // DB error — the artist row already saved.
        if (photoUrl) {
          try {
            saveAdminArtist({ id, photo: photoUrl })
          } catch {
            console.warn('[ArtistsAdmin] local photo override failed; artist row saved')
          }
        }
      } catch (err) {
        list.setError(err?.code === 'timeout' ? t('admin.saveTimeout') : adminErrorMessage(err, t))
        return
      }
      logActivity({ actor: user?.email || 'Admin', action: editing === 'new' ? 'Created artist' : 'Updated artist', detail: form.name || form.nameTa })
      await invalidateCaches()
      showToast(t('admin.saved'))
      setEditing(null)
      photo.reset()
      list.bumpVersion()
      return
    }
    // Admin is Supabase-only (27 Nov 2026): no local fallback.
    list.setError(t('admin.dbNotConnected'))
  }

  // Pasted-report C4: deleting an artist cascades to all their
  // albums + tracks. Count them first; the dialog then shows the
  // impact and, for a non-empty artist, requires typing the name
  // (ConfirmDialog requireTypeName replaces the old native prompt).
  // Artist delete is a hard delete in the DB — no Undo toast is
  // offered (there is no soft-delete to undo from).
  const handleDelete = async (artist) => {
    // H3: defense in depth — RLS is the real gate.
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
      const { albums, tracks } = await countArtistDependents(artist)
      list.setConfirmState({ kind: 'delete', item: artist, albums, tracks })
    } catch (err) {
      list.setError(adminDeleteErrorMessage(err, t))
    }
  }

  // No refetch after an artist delete (unlike Tracks/Playlists) — the
  // version bump re-reads the merged list, as before.
  const doDeleteArtist = (artist) =>
    list.deleteOne({
      item: artist,
      label: artist.name || artist.nameTa || artist.id,
      deleteFn: deleteArtistFromSupabase,
      deleteOptions: { confirmCascade: true },
      activity: 'Deleted artist',
    })

  const doBulkDelete = () =>
    list.deleteSelected({
      items: mergedArtists,
      getLabel: (a) => a.name || a.nameTa || a.id,
      deleteFn: deleteArtistFromSupabase,
      deleteOptions: { confirmCascade: true },
      activity: 'Bulk deleted artists',
      bulkUnit: 'artist(s)',
    })

  const deleteArtist = list.confirmState?.item
  const deleteHasDependents =
    (list.confirmState?.albums > 0 || list.confirmState?.tracks > 0)

  return (
    <div className="admin-page">
      <AdminPageHead
        title={t('admin.artists')}
        subtitle={`${list.sorted.length} ${t('admin.artists')}`}
        newLabel={t('admin.newArtist')}
        onNew={startNew}
      />

      <AdminErrorNotice
        error={list.error}
        role="status"
        retryLabel={t('admin.fallbackRetry')}
        onRetry={() => {
          list.setError('')
          void refetchArtists()
        }}
      />

      <FallbackBanner
        loading={artistsLoading}
        onRetry={() => void refetchArtists()}
      />

      {editing !== null && (
        <form className="admin-form admin-panel" onSubmit={handleSave} noValidate>
          <h2 className="admin-panel-title">{editing === 'new' ? t('admin.newArtist') : t('admin.editArtist')}</h2>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>{t('admin.nameEn')}</span>
              <input className="admin-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-required="true" aria-invalid={Boolean(list.error)} />
            </label>
            <label className="admin-field">
              <span>{t('admin.nameTa')}</span>
              <input className="admin-input" value={form.nameTa} onChange={(e) => setForm({ ...form, nameTa: e.target.value })} />
            </label>
            <label className="admin-field">
              <span>{t('admin.photo')}</span>
              <input type="file" accept="image/*" className="admin-input" onChange={photo.onChange} />
              {photo.preview && <img src={photo.preview} alt="" className="admin-cover-preview" />}
              {/* M31: the artists table has no photo column, so the
                  photo is stored in this browser only (localStorage
                  override) — say so, never present it as saved. */}
              <span className="admin-field-hint">{t('admin.artistPhotoLocalNote')}</span>
            </label>
          </div>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>{t('admin.bioTa')}</span>
              <textarea className="admin-input admin-textarea" rows={5} value={form.bioTa} onChange={(e) => setForm({ ...form, bioTa: e.target.value })} />
            </label>
            <label className="admin-field">
              <span>{t('admin.bioEn')}</span>
              <textarea className="admin-input admin-textarea" rows={5} value={form.bioEn} onChange={(e) => setForm({ ...form, bioEn: e.target.value })} />
            </label>
          </div>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>Instagram URL</span>
              <input className="admin-input" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="https://www.instagram.com/nandhamusic.official/" />
            </label>
            <label className="admin-field">
              <span>YouTube URL</span>
              <input className="admin-input" value={form.youtube} onChange={(e) => setForm({ ...form, youtube: e.target.value })} placeholder="https://youtube.com/@officialnandhamusic" />
            </label>
            <label className="admin-field">
              <span>Facebook URL</span>
              <input className="admin-input" value={form.facebook} onChange={(e) => setForm({ ...form, facebook: e.target.value })} placeholder="https://www.facebook.com/profile.php?id=61596981507074" />
            </label>
            <label className="admin-field">
              <span>Threads URL</span>
              <input className="admin-input" value={form.threads} onChange={(e) => setForm({ ...form, threads: e.target.value })} placeholder="https://www.threads.com/@officialnandhamusic" />
            </label>
            <label className="admin-field">
              <span>Spotify URL</span>
              <input className="admin-input" value={form.spotify} onChange={(e) => setForm({ ...form, spotify: e.target.value })} placeholder="https://open.spotify.com/artist/…" />
            </label>
            <label className="admin-field">
              <span>Website URL</span>
              <input className="admin-input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://…" />
            </label>
          </div>
          <AdminFormActions t={t} saveLabel={t('admin.saveArtist')} onCancel={() => setEditing(null)} />
        </form>
      )}

      <AdminToolbar t={t} list={list} searchPlaceholder={t('admin.searchArtists')} searchLabel={t('admin.searchArtists')} />

      <AdminBulkBar t={t} list={list} />

      <AdminListContent
        t={t}
        list={list}
        loading={artistsLoading}
        emptyTitle={t('admin.noArtistsFound')}
        emptyHint={t('admin.noTracksFoundHint')}
        emptyActionLabel={t('admin.addFirstArtist')}
        onEmptyAction={startNew}
      >
        <AdminTable
          list={list}
          selectAllLabel={t('admin.artists')}
          columns={
            <>
              <th scope="col">{t('admin.photo')}</th>
              <th scope="col" aria-sort={list.ariaSort('name')}>{list.sortHeader('name', t('admin.userName'))}</th>
              <th scope="col">{t('admin.description')}</th>
              <th scope="col">{t('common.actions')}</th>
            </>
          }
        >
          {list.pageRows.map((a) => (
            <tr key={a.id}>
              <td>
                <input type="checkbox" checked={list.selected.has(a.id)} onChange={() => list.toggleSelect(a.id)} aria-label={a.nameTa || a.name || a.id} />
              </td>
              <td>
                {a.photo || a.image ? (
                  <img src={a.photo || a.image} alt="" className="admin-thumb" />
                ) : (
                  <img src="/assets/nandha-logo.png" alt="" className="admin-thumb admin-thumb-logo" />
                )}
              </td>
              <td>
                <span className="admin-cell-main">{a.nameTa || a.name || '—'}</span>
                <span className="admin-cell-sub">{a.name || ''}</span>
              </td>
              <td className="admin-cell-truncate">{a.bioEn || a.bioTa || '—'}</td>
              <td>
                <AdminRowActions t={t} onEdit={() => startEdit(a)} onDelete={() => handleDelete(a)} />
              </td>
            </tr>
          ))}
        </AdminTable>
        <AdminCards>
          {list.pageRows.map((a) => (
            <AdminCard
              key={a.id}
              thumb={
                a.photo || a.image ? (
                  <img src={a.photo || a.image} alt="" className="list-card-thumb" />
                ) : (
                  <img src="/assets/nandha-logo.png" alt="" className="list-card-thumb" />
                )
              }
              title={a.nameTa || a.name || '—'}
              sub={a.name && a.nameTa ? a.name : ''}
              meta={
                <span className="admin-cell-sub">{a.bioEn || a.bioTa || '—'}</span>
              }
              menuLabel={`${t('common.actions')} — ${a.nameTa || a.name || a.id}`}
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
        deleteTitle={t('admin.confirmDelete', { title: deleteArtist?.name || deleteArtist?.nameTa || deleteArtist?.id || '' })}
        deleteBody={
          deleteHasDependents
            ? t('admin.artistDeleteImpact', { albums: list.confirmState.albums, tracks: list.confirmState.tracks })
            : t('admin.deleteNoUndo')
        }
        requireTypeName={
          deleteHasDependents
            ? (deleteArtist?.name || deleteArtist?.nameTa || deleteArtist?.id)
            : null
        }
        onConfirmDelete={doDeleteArtist}
        onConfirmBulkDelete={doBulkDelete}
      />
    </div>
  )
}
