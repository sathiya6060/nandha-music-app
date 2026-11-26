// Track editor — create (/admin/tracks/new) and edit (/admin/tracks/:id/edit).
// Includes hookStartSec / hookDurationSec (Discover hook clip timing).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { allTracks, allAlbums, allArtists, getTrack } from '../data/catalog.js'
import {
  getMergedTracks,
  saveAdminTrack,
  logActivity,
  invalidateCaches,
  STATUS_LABEL_KEYS,
  GENRE_LABEL_KEYS,
  normalizeStatus,
} from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'

const GENRES = ['Devotional', 'Love', 'Melody', 'Siddhar', 'Sivan']
const STATUS_VALUES = ['draft', 'scheduled', 'published', 'unlisted']

const EMPTY_FORM = {
  titleTa: '',
  titleEn: '',
  artistId: '',
  artist: '',
  featuredArtists: '',
  composer: '',
  lyricist: '',
  albumId: '',
  album: '',
  genre: 'Melody',
  language: 'Tamil',
  releaseDate: '',
  status: 'draft',
  scheduledAt: '',
  hookStartSec: 0,
  hookDurationSec: 30,
  lyricsTa: '',
  lyricsEn: '',
  description: '',
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export default function TrackEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useI18n()
  const isNew = !id || id === 'new'

  const existing = useMemo(() => {
    if (isNew) return null
    try {
      return getTrack(id) || getMergedTracks(allTracks).find((tr) => tr.id === id) || null
    } catch {
      return getMergedTracks(allTracks).find((tr) => tr.id === id) || null
    }
  }, [id, isNew])

  const [form, setForm] = useState(EMPTY_FORM)
  const [audioFile, setAudioFile] = useState(null)
  const [audioMeta, setAudioMeta] = useState(null)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [errors, setErrors] = useState({})
  const [warning, setWarning] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!existing) return
    setForm({
      titleTa: existing.titleTa || '',
      titleEn: existing.titleEn || '',
      artistId: existing.artistId || '',
      artist: existing.artist || '',
      featuredArtists: Array.isArray(existing.featuredArtists)
        ? existing.featuredArtists.join(', ')
        : existing.featuredArtists || '',
      composer: existing.composer || '',
      lyricist: existing.lyricist || '',
      albumId: existing.albumId || '',
      album: existing.album || '',
      genre: existing.genre || 'Melody',
      language: existing.language || 'Tamil',
      releaseDate: existing.releaseDate || '',
      status: normalizeStatus(existing.status),
      scheduledAt: existing.scheduledAt || '',
      hookStartSec: existing.hookStartSec ?? 0,
      hookDurationSec: existing.hookDurationSec ?? 30,
      lyricsTa: Array.isArray(existing.lyricsTa) ? existing.lyricsTa.join('\n') : existing.lyricsTa || '',
      lyricsEn: Array.isArray(existing.lyricsEn) ? existing.lyricsEn.join('\n') : existing.lyricsEn || '',
      description: existing.description || '',
    })
    if (existing.audioName) {
      setAudioMeta({ name: existing.audioName, size: existing.audioSize || 0 })
    }
    if (existing.cover) setCoverPreview(existing.cover)
  }, [existing])

  // Revoke object-URL previews on unmount / change.
  useEffect(() => {
    return () => {
      if (coverPreview && coverPreview.startsWith('blob:')) URL.revokeObjectURL(coverPreview)
    }
  }, [coverPreview])

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const onArtistChange = (artistId) => {
    const artist = allArtists.find((a) => a.id === artistId)
    setForm((f) => ({
      ...f,
      artistId,
      artist: artist ? artist.name || artist.nameEn || '' : f.artist,
    }))
  }

  const onAlbumChange = (albumId) => {
    const album = allAlbums.find((a) => a.id === albumId)
    setForm((f) => ({
      ...f,
      albumId,
      album: album ? album.titleTa || album.titleEn || '' : f.album,
    }))
  }

  const onAudioChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAudioFile(file)
    setAudioMeta({ name: file.name, size: file.size, type: file.type })
  }

  const onCoverChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverFile(file)
    if (coverPreview && coverPreview.startsWith('blob:')) URL.revokeObjectURL(coverPreview)
    setCoverPreview(URL.createObjectURL(file))
  }

  const validate = () => {
    const next = {}
    if (!form.titleTa.trim() && !form.titleEn.trim()) {
      next.titleTa = t('admin.titleRequired')
    }
    if (!form.artistId && !form.artist.trim()) {
      next.artist = t('admin.artistRequired')
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setNotice('')
    setWarning('')
    if (!validate()) return

    const wantsPublish = form.status === 'published'
    const hasAudio = Boolean(audioFile || audioMeta || existing?.audio128 || existing?.audio320)
    if (isNew && wantsPublish && !hasAudio) {
      // Demo mode: warn, do not block.
      setWarning(t('admin.audioWarn'))
    }

    setSaving(true)
    try {
      let coverDataUrl = existing?.cover || null
      if (coverFile) {
        try {
          coverDataUrl = await readFileAsDataUrl(coverFile)
        } catch {
          // Oversized cover for localStorage — keep the preview only.
          coverDataUrl = coverPreview || existing?.cover || null
        }
      }

      const track = {
        ...(existing || {}),
        id: isNew ? undefined : existing?.id,
        titleTa: form.titleTa.trim(),
        titleEn: form.titleEn.trim(),
        artistId: form.artistId || null,
        artist: form.artist.trim(),
        featuredArtists: form.featuredArtists.split(',').map((s) => s.trim()).filter(Boolean),
        composer: form.composer.trim(),
        lyricist: form.lyricist.trim(),
        albumId: form.albumId || null,
        album: form.album.trim(),
        genre: form.genre,
        language: form.language,
        releaseDate: form.releaseDate || null,
        status: normalizeStatus(form.status),
        scheduledAt: form.scheduledAt || null,
        hookStartSec: Math.max(0, Number(form.hookStartSec) || 0),
        hookDurationSec: Math.max(1, Number(form.hookDurationSec) || 30),
        lyricsTa: form.lyricsTa.split('\n').map((s) => s.trim()).filter(Boolean),
        lyricsEn: form.lyricsEn.split('\n').map((s) => s.trim()).filter(Boolean),
        description: form.description.trim(),
        cover: coverDataUrl,
        plays: existing?.plays || 0,
        // Demo mode: the audio file itself is not persisted to localStorage;
        // its metadata is, so the record shows what was uploaded.
        audioName: audioFile ? audioFile.name : existing?.audioName || null,
        audioSize: audioFile ? audioFile.size : existing?.audioSize || null,
      }

      const saved = saveAdminTrack(track)
      logActivity({
        actor: user?.email || 'Admin',
        action: isNew ? 'Created track' : 'Updated track',
        detail: saved.titleTa || saved.titleEn || saved.id,
      })
      await invalidateCaches(saved.id)
      setNotice(t('admin.trackSaved', { title: saved.titleTa || saved.titleEn || saved.id }))
      if (isNew) {
        navigate(`/admin/tracks/${saved.id}/edit`, { replace: true })
      }
    } finally {
      setSaving(false)
    }
  }

  if (!isNew && !existing) {
    return (
      <div className="admin-page">
        <div className="admin-empty">
          <h2>{t('admin.trackNotFound')}</h2>
          <p>{id}</p>
          <Link to="/admin/tracks" className="admin-btn admin-btn-primary">
            {t('admin.backToTracks')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">{isNew ? t('admin.newTrack') : t('admin.editTrack')}</h1>
          {!isNew && (
            <p className="admin-subtitle">{existing?.titleTa || existing?.titleEn || id}</p>
          )}
        </div>
        <Link to="/admin/tracks" className="admin-btn admin-btn-ghost">
          {t('admin.backToTracks')}
        </Link>
      </div>

      {notice && <div className="admin-notice admin-notice-success" role="status" aria-live="polite">{notice}</div>}
      {warning && <div className="admin-notice admin-notice-warn" role="status" aria-live="polite">{warning}</div>}

      <form className="admin-form" onSubmit={handleSave} noValidate>
        <div className="admin-form-grid">
          <label className="admin-field">
            <span>{t('admin.titleTa')} *</span>
            <input className="admin-input" value={form.titleTa} onChange={(e) => set('titleTa', e.target.value)} aria-required="true" aria-invalid={Boolean(errors.titleTa)} />
            {errors.titleTa && <span className="admin-field-error" role="alert">{errors.titleTa}</span>}
          </label>
          <label className="admin-field">
            <span>{t('admin.titleEn')}</span>
            <input className="admin-input" value={form.titleEn} onChange={(e) => set('titleEn', e.target.value)} />
          </label>
          <label className="admin-field">
            <span>{t('admin.artist')} *</span>
            <select className="admin-input" value={form.artistId} onChange={(e) => onArtistChange(e.target.value)} aria-required="true" aria-invalid={Boolean(errors.artist)}>
              <option value="">{t('admin.selectArtist')}</option>
              {allArtists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.nameEn || a.id}
                </option>
              ))}
            </select>
            <input
              className="admin-input admin-input-inline"
              value={form.artist}
              onChange={(e) => set('artist', e.target.value)}
              placeholder={t('admin.artistDisplayName')}
              aria-label={t('admin.artistDisplayName')}
            />
            {errors.artist && <span className="admin-field-error" role="alert">{errors.artist}</span>}
          </label>
          <label className="admin-field">
            <span>{t('admin.featuredArtists')}</span>
            <input className="admin-input" value={form.featuredArtists} onChange={(e) => set('featuredArtists', e.target.value)} />
          </label>
          <label className="admin-field">
            <span>{t('admin.composer')}</span>
            <input className="admin-input" value={form.composer} onChange={(e) => set('composer', e.target.value)} />
          </label>
          <label className="admin-field">
            <span>{t('admin.lyricist')}</span>
            <input className="admin-input" value={form.lyricist} onChange={(e) => set('lyricist', e.target.value)} />
          </label>
          <label className="admin-field">
            <span>{t('admin.album')}</span>
            <select className="admin-input" value={form.albumId} onChange={(e) => onAlbumChange(e.target.value)}>
              <option value="">{t('admin.noAlbum')}</option>
              {allAlbums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.titleTa || a.titleEn || a.id}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>{t('admin.genre')}</span>
            <select className="admin-input" value={form.genre} onChange={(e) => set('genre', e.target.value)}>
              {GENRES.map((g) => (
                <option key={g} value={g}>{GENRE_LABEL_KEYS[g] ? t(GENRE_LABEL_KEYS[g]) : g}</option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>{t('admin.language')}</span>
            <select className="admin-input" value={form.language} onChange={(e) => set('language', e.target.value)}>
              <option value="Tamil">Tamil</option>
              <option value="English">English</option>
              <option value="Instrumental">Instrumental</option>
            </select>
          </label>
          <label className="admin-field">
            <span>{t('admin.releaseDate')}</span>
            <input type="date" className="admin-input" value={form.releaseDate || ''} onChange={(e) => set('releaseDate', e.target.value)} />
          </label>
          <label className="admin-field">
            <span>{t('admin.status')}</span>
            <select className="admin-input" value={form.status} onChange={(e) => set('status', e.target.value)}>
              {STATUS_VALUES.map((s) => (
                <option key={s} value={s}>{t(STATUS_LABEL_KEYS[s])}</option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>{t('admin.scheduledPublish')}</span>
            <input
              type="datetime-local"
              className="admin-input"
              value={form.scheduledAt || ''}
              onChange={(e) => set('scheduledAt', e.target.value)}
              disabled={form.status !== 'scheduled'}
            />
          </label>
          <label className="admin-field">
            <span>{t('admin.hookStart')}</span>
            <input
              type="number"
              min="0"
              step="1"
              className="admin-input"
              value={form.hookStartSec}
              onChange={(e) => set('hookStartSec', e.target.value)}
            />
            <span className="admin-field-hint">{t('admin.hookStartHint')}</span>
          </label>
          <label className="admin-field">
            <span>{t('admin.hookDuration')}</span>
            <input
              type="number"
              min="1"
              step="1"
              className="admin-input"
              value={form.hookDurationSec}
              onChange={(e) => set('hookDurationSec', e.target.value)}
            />
          </label>
        </div>

        <div className="admin-form-grid">
          <label className="admin-field">
            <span>{t('admin.audioFile')}</span>
            <input type="file" accept=".mp3,audio/mpeg" className="admin-input" onChange={onAudioChange} />
            {audioMeta && (
              <span className="admin-field-hint">
                {audioMeta.name}
                {audioMeta.size ? ` · ${formatBytes(audioMeta.size)}` : ''}
              </span>
            )}
            <span className="admin-field-hint">{t('admin.demoNotice')}</span>
          </label>
          <label className="admin-field">
            <span>{t('admin.coverFile')}</span>
            <input type="file" accept="image/*" className="admin-input" onChange={onCoverChange} />
            {coverPreview && <img src={coverPreview} alt="" className="admin-cover-preview" />}
          </label>
        </div>

        <div className="admin-form-grid">
          <label className="admin-field">
            <span>{t('admin.lyricsTa')}</span>
            <textarea className="admin-input admin-textarea" rows={8} value={form.lyricsTa} onChange={(e) => set('lyricsTa', e.target.value)} />
          </label>
          <label className="admin-field">
            <span>{t('admin.lyricsEn')}</span>
            <textarea className="admin-input admin-textarea" rows={8} value={form.lyricsEn} onChange={(e) => set('lyricsEn', e.target.value)} />
          </label>
        </div>

        <label className="admin-field">
          <span>{t('admin.description')}</span>
          <textarea className="admin-input admin-textarea" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </label>

        <div className="admin-form-actions">
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
            {saving ? t('common.saving') : t('admin.saveTrack')}
          </button>
          <Link to="/admin/tracks" className="admin-btn admin-btn-ghost">
            {t('common.cancel')}
          </Link>
        </div>
      </form>
    </div>
  )
}
