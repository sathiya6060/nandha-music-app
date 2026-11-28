// Artists admin — list + editor (photo, bilingual bio, social links).
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
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [error, setError] = useState('')
  const [confirmState, setConfirmState] = useState(null) // { kind: 'delete'|'bulkDelete', artist?, albums?, tracks? }
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [selected, setSelected] = useState(new Set())
  const showToast = useToast()

  // Supabase read layer (B1); static catalog + local overrides are
  // the fallback.
  const { data: sbArtists, isLoading: artistsLoading, refetch: refetchArtists } = useArtists()
  const mergedArtists = useMemo(() => getMergedArtists(sbArtists || artists), [version, sbArtists])
  const debouncedSearch = useDebouncedValue(search)
  const artistName = (a) => a.nameTa || a.name || a.nameEn || ''
  const visibleArtists = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return mergedArtists
    return mergedArtists.filter((a) => [a.name, a.nameTa, a.nameEn, a.bioEn, a.bioTa]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)))
  }, [mergedArtists, debouncedSearch])
  const sortedArtists = useMemo(
    () => sortRows(visibleArtists, sort.key, sort.dir, (a) => artistName(a), 'text'),
    [visibleArtists, sort],
  )
  const artistPageCount = pageCountFor(sortedArtists.length, pageSize)
  const artistCurrentPage = clampPage(page, sortedArtists.length, pageSize)
  const pageArtists = paginateRows(sortedArtists, artistCurrentPage, pageSize)
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
      const allSelected = pageArtists.every((a) => next.has(a.id))
      for (const a of pageArtists) {
        if (allSelected) next.delete(a.id)
        else next.add(a.id)
      }
      return next
    })
  }

  const startNew = () => {
    setEditing('new')
    setForm(EMPTY_ARTIST)
    setPhotoPreview('')
    setPhotoFile(null)
    setError('')
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
    setPhotoPreview(artist.photo || artist.image || '')
    setPhotoFile(null)
    setError('')
  }

  const onPhotoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    if (photoPreview && photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    // H3: defense in depth — RLS is the real gate.
    if (!isAdmin) {
      setError(t('admin.notAdmin'))
      return
    }
    if (!form.name.trim() && !form.nameTa.trim()) {
      setError(t('admin.artistNameRequired'))
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
            { photoFile },
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
        setError(err?.code === 'timeout' ? t('admin.saveTimeout') : adminErrorMessage(err, t))
        return
      }
      logActivity({ actor: user?.email || 'Admin', action: editing === 'new' ? 'Created artist' : 'Updated artist', detail: form.name || form.nameTa })
      await invalidateCaches()
      showToast(t('admin.saved'))
      setEditing(null)
      setPhotoFile(null)
      setVersion((v) => v + 1)
      return
    }
    // Admin is Supabase-only (27 Nov 2026): no local fallback.
    setError(t('admin.dbNotConnected'))
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
      setError(t('admin.notAdmin'))
      return
    }
    setError('')
    if (!supabaseWritesEnabled()) {
      setError(t('admin.dbNotConnected'))
      return
    }
    try {
      const { albums, tracks } = await countArtistDependents(artist)
      setConfirmState({ kind: 'delete', artist, albums, tracks })
    } catch (err) {
      setError(adminDeleteErrorMessage(err, t))
    }
  }

  const doDeleteArtist = async (artist) => {
    const name = artist.name || artist.nameTa || artist.id
    if (!isAdmin) {
      setError(t('admin.notAdmin'))
      return
    }
    setError('')
    if (supabaseWritesEnabled()) {
      try {
        await deleteArtistFromSupabase(artist, { confirmCascade: true })
      } catch (err) {
        setError(adminDeleteErrorMessage(err, t))
        return
      }
      logActivity({ actor: user?.email || 'Admin', action: 'Deleted artist', detail: name })
      showToast(t('admin.itemDeleted', { title: name }))
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(artist.id)
        return next
      })
      setVersion((v) => v + 1)
      return
    }
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
    // Bulk delete uses one dialog for the whole selection, so there
    // is no per-artist typed name here; each delete still passes
    // confirmCascade after the single confirmation.
    let done = 0
    const failed = []
    for (const id of selected) {
      const artist = mergedArtists.find((a) => a.id === id)
      if (!artist) {
        failed.push(id)
        continue
      }
      try {
        await deleteArtistFromSupabase(artist, { confirmCascade: true })
        done += 1
      } catch {
        failed.push(artist.name || artist.nameTa || artist.id)
      }
    }
    if (done > 0) {
      logActivity({ actor: user?.email || 'Admin', action: 'Bulk deleted artists', detail: `${done} artist(s)` })
      showToast(t('admin.bulkDeleteResult', { done, total: selected.size }))
    }
    if (failed.length > 0) {
      setError(t('admin.bulkDeleteFailed', { count: failed.length, titles: failed.join(', ') }))
    }
    setSelected(new Set())
    setVersion((v) => v + 1)
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">{t('admin.artists')}</h1>
          <p className="admin-subtitle">
            {sortedArtists.length} {t('admin.artists')}
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={startNew}>
          {t('admin.newArtist')}
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
              void refetchArtists()
            }}
            style={{ marginLeft: 12 }}
          >
            {t('admin.fallbackRetry')}
          </button>
        </div>
      )}

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
              <input className="admin-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-required="true" aria-invalid={Boolean(error)} />
            </label>
            <label className="admin-field">
              <span>{t('admin.nameTa')}</span>
              <input className="admin-input" value={form.nameTa} onChange={(e) => setForm({ ...form, nameTa: e.target.value })} />
            </label>
            <label className="admin-field">
              <span>{t('admin.photo')}</span>
              <input type="file" accept="image/*" className="admin-input" onChange={onPhotoChange} />
              {photoPreview && <img src={photoPreview} alt="" className="admin-cover-preview" />}
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
          <div className="admin-form-actions">
            <button type="submit" className="admin-btn admin-btn-primary">{t('admin.saveArtist')}</button>
            <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
          </div>
        </form>
      )}

      <div className="admin-toolbar">
        <input
          type="search"
          className="admin-input admin-search"
          placeholder={t('admin.searchArtists')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          aria-label={t('admin.searchArtists')}
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

      {artistsLoading ? (
        <div className="list-skeleton" aria-busy="true" aria-label={t('admin.loadingRows')}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="list-skeleton-row" />
          ))}
        </div>
      ) : pageArtists.length === 0 ? (
        <div className="admin-empty">
          <h2>{t('admin.noArtistsFound')}</h2>
          <p>{t('admin.noTracksFoundHint')}</p>
          <button type="button" className="admin-btn admin-btn-primary" onClick={startNew}>
            {t('admin.addFirstArtist')}
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
                  checked={pageArtists.length > 0 && pageArtists.every((a) => selected.has(a.id))}
                  onChange={toggleSelectPage}
                  aria-label={t('admin.artists')}
                />
              </th>
              <th scope="col">{t('admin.photo')}</th>
              <th scope="col" aria-sort={sort.key === 'name' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>{sortHeader('name', t('admin.userName'))}</th>
              <th scope="col">{t('admin.description')}</th>
              <th scope="col">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {pageArtists.map((a) => (
              <tr key={a.id}>
                <td>
                  <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} aria-label={a.nameTa || a.name || a.id} />
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
                  <div className="admin-row-actions">
                    <button type="button" className="admin-btn admin-btn-small" onClick={() => startEdit(a)}>{t('common.edit')}</button>
                    <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => handleDelete(a)}>{t('common.delete')}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="list-cards">
          {pageArtists.map((a) => (
            <article key={a.id} className="list-card">
              {a.photo || a.image ? (
                <img src={a.photo || a.image} alt="" className="list-card-thumb" />
              ) : (
                <img src="/assets/nandha-logo.png" alt="" className="list-card-thumb" />
              )}
              <div className="list-card-body">
                <span className="list-card-title">{a.nameTa || a.name || '—'}</span>
                <span className="list-card-sub">{a.name && a.nameTa ? a.name : ''}</span>
                <span className="list-card-meta">
                  <span className="admin-cell-sub">{a.bioEn || a.bioTa || '—'}</span>
                </span>
              </div>
              <details className="list-card-menu">
                <summary aria-label={`${t('common.actions')} — ${a.nameTa || a.name || a.id}`}>⋯</summary>
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

      {sortedArtists.length > pageSize && (
        <div className="admin-pagination">
          <button type="button" className="admin-btn admin-btn-small" disabled={artistCurrentPage <= 1} onClick={() => setPage(artistCurrentPage - 1)}>
            {t('common.previous')}
          </button>
          <span>{t('common.pageOf', { page: artistCurrentPage, total: artistPageCount })}</span>
          <button type="button" className="admin-btn admin-btn-small" disabled={artistCurrentPage >= artistPageCount} onClick={() => setPage(artistCurrentPage + 1)}>
            {t('common.next')}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmState?.kind === 'delete'}
        title={t('admin.confirmDelete', { title: confirmState?.artist?.name || confirmState?.artist?.nameTa || confirmState?.artist?.id || '' })}
        body={(confirmState?.albums > 0 || confirmState?.tracks > 0)
          ? t('admin.artistDeleteImpact', { albums: confirmState.albums, tracks: confirmState.tracks })
          : t('admin.deleteNoUndo')}
        confirmLabel={t('common.delete')}
        danger
        requireTypeName={(confirmState?.albums > 0 || confirmState?.tracks > 0)
          ? (confirmState.artist?.name || confirmState.artist?.nameTa || confirmState.artist?.id)
          : null}
        onConfirm={() => {
          const artist = confirmState.artist
          setConfirmState(null)
          void doDeleteArtist(artist)
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
    </div>
  )
}
