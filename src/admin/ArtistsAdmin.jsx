// Artists admin — list + editor (photo, bilingual bio, social links).
import { useMemo, useState } from 'react'
import { artists } from '../data/catalog.js'
import { useArtists } from '../lib/supabaseCatalog.js'
import {
  supabaseWritesEnabled,
  saveArtistToSupabase,
  deleteArtistFromSupabase,
  adminErrorMessage,
  adminDeleteErrorMessage,
} from '../lib/supabaseAdmin.js'
import {
  getMergedArtists,
  saveAdminArtist,
  deleteAdminArtist,
  logActivity,
  invalidateCaches,
} from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'

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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export default function ArtistsAdmin() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_ARTIST)
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoDataUrl, setPhotoDataUrl] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  // Supabase read layer (B1); static catalog + local overrides are
  // the fallback.
  const { data: sbArtists } = useArtists()
  const mergedArtists = useMemo(() => getMergedArtists(sbArtists || artists), [version, sbArtists])

  const startNew = () => {
    setEditing('new')
    setForm(EMPTY_ARTIST)
    setPhotoPreview('')
    setPhotoDataUrl('')
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
    setPhotoDataUrl('')
    setPhotoFile(null)
    setError('')
  }

  const onPhotoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    if (photoPreview && photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
    setPhotoPreview(URL.createObjectURL(file))
    try {
      setPhotoDataUrl(await readFileAsDataUrl(file))
    } catch {
      setPhotoDataUrl('')
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
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
        const { id, photoUrl } = await saveArtistToSupabase(
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
        )
        if (photoUrl) saveAdminArtist({ id, photo: photoUrl })
      } catch (err) {
        setError(adminErrorMessage(err, t))
        return
      }
      logActivity({ actor: user?.email || 'Admin', action: editing === 'new' ? 'Created artist' : 'Updated artist', detail: form.name || form.nameTa })
      await invalidateCaches()
      setNotice(t('admin.saved'))
      setEditing(null)
      setPhotoFile(null)
      setVersion((v) => v + 1)
      return
    }
    const saved = saveAdminArtist({
      ...base,
      id: editing === 'new' ? undefined : editing,
      name: form.name.trim(),
      nameEn: form.name.trim(),
      nameTa: form.nameTa.trim(),
      bioTa: form.bioTa.trim(),
      bioEn: form.bioEn.trim(),
      photo: photoDataUrl || (photoPreview && !photoPreview.startsWith('blob:') ? photoPreview : base.photo || base.image || null),
      socials: {
        instagram: form.instagram.trim(),
        youtube: form.youtube.trim(),
        facebook: form.facebook.trim(),
        threads: form.threads.trim(),
        spotify: form.spotify.trim(),
        website: form.website.trim(),
      },
    })
    logActivity({ actor: user?.email || 'Admin', action: editing === 'new' ? 'Created artist' : 'Updated artist', detail: saved.name || saved.nameTa })
    await invalidateCaches()
    setNotice(t('admin.saved'))
    setEditing(null)
    setVersion((v) => v + 1)
  }

  const handleDelete = async (artist) => {
    const name = artist.name || artist.nameTa || artist.id
    if (!window.confirm(t('admin.confirmDelete', { title: name }))) return
    setError('')
    if (supabaseWritesEnabled()) {
      try {
        await deleteArtistFromSupabase(artist)
      } catch (err) {
        setError(adminDeleteErrorMessage(err, t))
        return
      }
      logActivity({ actor: user?.email || 'Admin', action: 'Deleted artist', detail: name })
      setNotice(t('admin.saved'))
      setVersion((v) => v + 1)
      return
    }
    deleteAdminArtist(artist.id)
    logActivity({ actor: user?.email || 'Admin', action: 'Deleted artist', detail: name })
    await invalidateCaches()
    setNotice(t('admin.saved'))
    setVersion((v) => v + 1)
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">{t('admin.artists')}</h1>
          <p className="admin-subtitle">
            {mergedArtists.length} {t('admin.artists')}
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={startNew}>
          {t('admin.newArtist')}
        </button>
      </div>

      {notice && <div className="admin-notice" role="status" aria-live="polite">{notice}</div>}
      {error && <div className="admin-notice admin-notice-warn" role="status" aria-live="polite">{error}</div>}

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

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">{t('admin.photo')}</th>
              <th scope="col">{t('admin.userName')}</th>
              <th scope="col">{t('admin.description')}</th>
              <th scope="col">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {mergedArtists.map((a) => (
              <tr key={a.id}>
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
    </div>
  )
}
