// Curated playlists admin — CRUD with track add/remove + reorder.
import { useMemo, useState } from 'react'
import { tracks, playlists } from '../data/catalog.js'
import {
  getMergedTracks,
  getMergedPlaylists,
  saveAdminPlaylist,
  deleteAdminPlaylist,
  logActivity,
  invalidateCaches,
} from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'

const EMPTY_PLAYLIST = { name: '', description: '', trackIds: [] }

export default function PlaylistsAdmin() {
  const { user } = useAuth()
  const { t } = useI18n()
  const allTracks = useMemo(() => getMergedTracks(tracks).filter((tr) => tr.status !== 'deleted'), [])
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_PLAYLIST)
  const [coverPreview, setCoverPreview] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const mergedPlaylists = useMemo(() => getMergedPlaylists(playlists), [version])

  const startNew = () => {
    setEditing('new')
    setForm(EMPTY_PLAYLIST)
    setCoverPreview('')
    setError('')
  }

  const startEdit = (playlist) => {
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
    if (!form.name.trim()) {
      setError(t('admin.playlistNameRequired'))
      return
    }
    const base = editing === 'new' ? {} : mergedPlaylists.find((p) => p.id === editing) || {}
    const saved = saveAdminPlaylist({
      ...base,
      id: editing === 'new' ? undefined : editing,
      name: form.name.trim(),
      titleEn: form.name.trim(),
      description: form.description.trim(),
      descriptionEn: form.description.trim(),
      descriptionTa: form.description.trim(),
      trackIds: form.trackIds,
      cover: coverPreview && !coverPreview.startsWith('blob:') ? coverPreview : base.cover || null,
    })
    logActivity({ actor: user?.email || 'Admin', action: editing === 'new' ? 'Created playlist' : 'Updated playlist', detail: saved.name })
    await invalidateCaches()
    setNotice(t('admin.saved'))
    setError('')
    setEditing(null)
    setVersion((v) => v + 1)
  }

  const handleDelete = async (playlist) => {
    const name = playlist.name || playlist.titleTa || playlist.titleEn || playlist.id
    if (!window.confirm(t('admin.confirmDelete', { title: name }))) return
    deleteAdminPlaylist(playlist.id)
    logActivity({ actor: user?.email || 'Admin', action: 'Deleted playlist', detail: name })
    await invalidateCaches()
    setNotice(t('admin.saved'))
    setVersion((v) => v + 1)
  }

  const orderedTracks = form.trackIds.map((id) => allTracks.find((tr) => tr.id === id)).filter(Boolean)
  const unselectedTracks = allTracks.filter((tr) => !form.trackIds.includes(tr.id))

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">{t('admin.playlists')}</h1>
          <p className="admin-subtitle">
            {mergedPlaylists.length} {t('admin.playlists')}
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={startNew}>
          {t('admin.newPlaylist')}
        </button>
      </div>

      {notice && <div className="admin-notice" role="status" aria-live="polite">{notice}</div>}
      {error && <div className="admin-notice admin-notice-warn" role="status" aria-live="polite">{error}</div>}

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

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">{t('admin.cover')}</th>
              <th scope="col">{t('admin.title')}</th>
              <th scope="col">{t('admin.description')}</th>
              <th scope="col">{t('admin.tracks')}</th>
              <th scope="col">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {mergedPlaylists.map((p) => (
              <tr key={p.id}>
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
    </div>
  )
}
