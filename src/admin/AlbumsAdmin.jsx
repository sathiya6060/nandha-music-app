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
} from '../lib/supabaseAdmin.js'
import {
  getMergedTracks,
  getMergedAlbums,
  logActivity,
} from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'

const EMPTY_ALBUM = { titleTa: '', titleEn: '', releaseDate: '', trackIds: [] }

export default function AlbumsAdmin() {
  const { user } = useAuth()
  const { t } = useI18n()
  // Supabase read layer (B1, all statuses for admin); static catalog +
  // local overrides are the fallback.
  const { data: sbTracks } = useTracks({ publishedOnly: false })
  const { data: sbAlbums } = useAlbums()
  const adminTracks = useMemo(() => getMergedTracks(sbTracks || catalogTracks), [sbTracks])
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState(null) // album id or 'new'
  const [form, setForm] = useState(EMPTY_ALBUM)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const mergedAlbums = useMemo(() => getMergedAlbums(sbAlbums || catalogAlbums), [version, sbAlbums])

  const startNew = () => {
    setEditing('new')
    setForm(EMPTY_ALBUM)
    setCoverFile(null)
    setCoverPreview('')
    setError('')
  }

  const startEdit = (album) => {
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
    setForm((f) => ({
      ...f,
      trackIds: f.trackIds.includes(trackId)
        ? f.trackIds.filter((id) => id !== trackId)
        : [...f.trackIds, trackId],
    }))
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
    const base = editing === 'new' ? {} : mergedAlbums.find((a) => a.id === editing) || {}
    // Supabase path (B1): cover -> "covers" bucket, row + track
    // membership -> tables. A failed write shows a clear message
    // and does NOT fall back to localStorage.
    if (supabaseWritesEnabled()) {
      try {
        const savedAlbum = await saveAlbumToSupabase(
          {
            ...base,
            id: editing === 'new' ? undefined : editing,
            titleTa: form.titleTa.trim(),
            titleEn: form.titleEn.trim(),
            releaseDate: form.releaseDate || null,
            cover: coverPreview && !coverPreview.startsWith('blob:') ? coverPreview : base.cover || null,
          },
          { coverFile, trackIds: form.trackIds },
        )
        // M4: tracks dropped from membership (unresolvable ids) are
        // reported, not silently lost.
        const droppedNote = savedAlbum.droppedTrackIds?.length > 0
          ? ` ${t('admin.membershipDropped', { count: savedAlbum.droppedTrackIds.length })}`
          : ''
        setNotice(t('admin.saved') + droppedNote)
      } catch (err) {
        setError(adminErrorMessage(err, t))
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

  const handleDelete = async (album) => {
    const title = album.titleTa || album.titleEn || album.id
    if (!window.confirm(t('admin.confirmDelete', { title }))) return
    setError('')
    if (supabaseWritesEnabled()) {
      try {
        await deleteAlbumFromSupabase(album)
      } catch (err) {
        setError(adminDeleteErrorMessage(err, t))
        return
      }
      logActivity({ actor: user?.email || 'Admin', action: 'Deleted album', detail: title })
      setNotice(t('admin.saved'))
      setVersion((v) => v + 1)
      return
    }
    // Admin is Supabase-only (27 Nov 2026): no local fallback.
    setError(t('admin.dbNotConnected'))
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
            {mergedAlbums.length} {t('admin.albums')}
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={startNew}>
          {t('admin.newAlbum')}
        </button>
      </div>

      {notice && <div className="admin-notice" role="status" aria-live="polite">{notice}</div>}
      {error && <div className="admin-notice admin-notice-warn" role="alert" aria-live="polite">{error}</div>}

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

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">{t('admin.cover')}</th>
              <th scope="col">{t('admin.title')}</th>
              <th scope="col">{t('admin.releaseDate')}</th>
              <th scope="col">{t('admin.tracks')}</th>
              <th scope="col">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {mergedAlbums.map((a) => {
              const count = Array.isArray(a.trackIds)
                ? a.trackIds.length
                : adminTracks.filter((tr) => tr.albumId === a.id).length
              return (
                <tr key={a.id}>
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
    </div>
  )
}
