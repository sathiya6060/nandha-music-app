// Albums admin — list + create/edit with track ordering.
import { useMemo, useState } from 'react'
import { allTracks as catalogTracks, allAlbums as catalogAlbums } from '../data/catalog.js'
import {
  getMergedTracks,
  getMergedAlbums,
  saveAdminAlbum,
  deleteAdminAlbum,
  logActivity,
  invalidateCaches,
} from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'

const EMPTY_ALBUM = { titleTa: '', titleEn: '', releaseDate: '', trackIds: [] }

export default function AlbumsAdmin() {
  const { user } = useAuth()
  const { t } = useI18n()
  const allTracks = useMemo(() => getMergedTracks(catalogTracks), [])
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState(null) // album id or 'new'
  const [form, setForm] = useState(EMPTY_ALBUM)
  const [coverPreview, setCoverPreview] = useState('')
  const [notice, setNotice] = useState('')

  const mergedAlbums = useMemo(() => getMergedAlbums(catalogAlbums), [version])

  const startNew = () => {
    setEditing('new')
    setForm(EMPTY_ALBUM)
    setCoverPreview('')
  }

  const startEdit = (album) => {
    setEditing(album.id)
    setForm({
      titleTa: album.titleTa || '',
      titleEn: album.titleEn || '',
      releaseDate: album.releaseDate || '',
      trackIds: Array.isArray(album.trackIds)
        ? [...album.trackIds]
        : allTracks.filter((tr) => tr.albumId === album.id).map((tr) => tr.id),
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
    if (coverPreview && coverPreview.startsWith('blob:')) URL.revokeObjectURL(coverPreview)
    setCoverPreview(URL.createObjectURL(file))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    const base = editing === 'new' ? {} : mergedAlbums.find((a) => a.id === editing) || {}
    const saved = saveAdminAlbum({
      ...base,
      id: editing === 'new' ? undefined : editing,
      titleTa: form.titleTa.trim(),
      titleEn: form.titleEn.trim(),
      releaseDate: form.releaseDate || null,
      trackIds: form.trackIds,
      cover: coverPreview && !coverPreview.startsWith('blob:') ? coverPreview : base.cover || null,
    })
    logActivity({ actor: user?.email || 'Admin', action: editing === 'new' ? 'Created album' : 'Updated album', detail: saved.titleTa || saved.titleEn })
    await invalidateCaches()
    setNotice(t('admin.saved'))
    setEditing(null)
    setVersion((v) => v + 1)
  }

  const handleDelete = async (album) => {
    const title = album.titleTa || album.titleEn || album.id
    if (!window.confirm(t('admin.confirmDelete', { title }))) return
    deleteAdminAlbum(album.id)
    logActivity({ actor: user?.email || 'Admin', action: 'Deleted album', detail: title })
    await invalidateCaches()
    setNotice(t('admin.saved'))
    setVersion((v) => v + 1)
  }

  const orderedTracks = form.trackIds
    .map((id) => allTracks.find((tr) => tr.id === id))
    .filter(Boolean)
  const unselectedTracks = allTracks.filter((tr) => !form.trackIds.includes(tr.id) && tr.status !== 'deleted')

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
                : allTracks.filter((tr) => tr.albumId === a.id).length
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
