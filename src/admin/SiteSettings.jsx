// Site settings / EPK — bio, announcement, Artist Pick, press photos, contact,
// plus Song of the Day (admin override for catalog.js getSongOfTheDay).
import { useMemo, useState } from 'react'
import { tracks, getSongOfTheDay, REAL_TRACK_ID } from '../data/catalog.js'
import {
  getMergedTracks,
  loadSiteSettings,
  saveSiteSettings,
  loadSongOfDay,
  saveSongOfDay,
  logActivity,
  invalidateCaches,
} from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'

export default function SiteSettings() {
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const allTracks = useMemo(() => getMergedTracks(tracks).filter((tr) => tr.status !== 'deleted'), [])
  const [form, setForm] = useState(() => loadSiteSettings())
  const [pressPhotoInput, setPressPhotoInput] = useState('')
  const [notice, setNotice] = useState('')
  const [sotdVersion, setSotdVersion] = useState(0)

  // Song of the Day pick: devotional tracks first; default Vaazhvinil Orumurayenum.
  const sotdOptions = useMemo(
    () =>
      [...allTracks].sort(
        (a, b) => (a.genre === 'Devotional' ? 0 : 1) - (b.genre === 'Devotional' ? 0 : 1),
      ),
    [allTracks],
  )
  const [sotdTrackId, setSotdTrackId] = useState(() => {
    const override = loadSongOfDay()
    if (override && override.date === new Date().toDateString() && override.trackId) {
      return override.trackId
    }
    return REAL_TRACK_ID
  })

  // Currently effective pick (override for today wins, else the automatic pick).
  const effectiveSotd = useMemo(() => getSongOfTheDay(), [sotdVersion])
  const todayLabel = new Date().toLocaleDateString(lang, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const onPressPhotoFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Demo mode: keep an object URL for the session; URLs typed in are persisted.
    const url = URL.createObjectURL(file)
    setForm((f) => ({ ...f, pressPhotos: [...(f.pressPhotos || []), url] }))
  }

  const addPressPhotoUrl = () => {
    const url = pressPhotoInput.trim()
    if (!url) return
    setForm((f) => ({ ...f, pressPhotos: [...(f.pressPhotos || []), url] }))
    setPressPhotoInput('')
  }

  const removePressPhoto = (index) => {
    setForm((f) => ({ ...f, pressPhotos: (f.pressPhotos || []).filter((_, i) => i !== index) }))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    const saved = saveSiteSettings({
      bioTa: form.bioTa,
      bioEn: form.bioEn,
      announcement: form.announcement,
      artistPickTrackId: form.artistPickTrackId,
      pressPhotos: form.pressPhotos || [],
      contactEmail: form.contactEmail,
    })
    logActivity({ actor: user?.email || 'Admin', action: 'Updated site settings', detail: 'EPK / announcement / Artist Pick' })
    await invalidateCaches()
    setNotice(t('admin.saved'))
    setForm(saved)
  }

  const handleSaveSotd = async () => {
    saveSongOfDay(sotdTrackId)
    logActivity({
      actor: user?.email || 'Admin',
      action: 'Set Song of the Day',
      detail: sotdTrackId,
    })
    await invalidateCaches()
    setNotice(t('admin.saved'))
    setSotdVersion((v) => v + 1)
  }

  const artistPick = allTracks.find((tr) => tr.id === form.artistPickTrackId)
  const sotdTrack = allTracks.find((tr) => tr.id === sotdTrackId)

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">{t('admin.siteSettings')}</h1>
        </div>
      </div>

      {notice && <div className="admin-notice admin-notice-success" role="status" aria-live="polite">{notice}</div>}

      <form className="admin-form" onSubmit={handleSave} noValidate>
        <div className="admin-form-grid">
          <label className="admin-field">
            <span>{t('admin.siteBioTa')}</span>
            <textarea className="admin-input admin-textarea" rows={5} value={form.bioTa || ''} onChange={(e) => set('bioTa', e.target.value)} />
          </label>
          <label className="admin-field">
            <span>{t('admin.siteBioEn')}</span>
            <textarea className="admin-input admin-textarea" rows={5} value={form.bioEn || ''} onChange={(e) => set('bioEn', e.target.value)} />
          </label>
        </div>

        <label className="admin-field">
          <span>{t('admin.announcement')}</span>
          <input className="admin-input" value={form.announcement || ''} onChange={(e) => set('announcement', e.target.value)} />
        </label>

        <label className="admin-field">
          <span>{t('admin.artistPick')}</span>
          <select className="admin-input" value={form.artistPickTrackId || ''} onChange={(e) => set('artistPickTrackId', e.target.value)}>
            <option value="">{t('common.none')}</option>
            {allTracks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.titleTa || tr.titleEn} — {tr.artist || ''}
              </option>
            ))}
          </select>
          {artistPick && (
            <span className="admin-field-hint">
              {artistPick.titleTa || artistPick.titleEn}
              {artistPick.artist ? ` — ${artistPick.artist}` : ''}
            </span>
          )}
        </label>

        <div className="admin-field">
          <span className="admin-field-label">{t('admin.pressPhotos')}</span>
          {(form.pressPhotos || []).length > 0 && (
            <ul className="admin-press-list">
              {(form.pressPhotos || []).map((url, i) => (
                <li key={`${url}-${i}`} className="admin-press-item">
                  {url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:') ? (
                    <img src={url} alt="" className="admin-thumb" />
                  ) : null}
                  <span className="admin-press-url">{url}</span>
                  <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => removePressPhoto(i)}>
                    {t('common.remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="admin-inline-row">
            <input
              className="admin-input"
              value={pressPhotoInput}
              onChange={(e) => setPressPhotoInput(e.target.value)}
              placeholder={t('admin.pressPhotoUrl')}
              aria-label={t('admin.pressPhotoUrl')}
            />
            <button type="button" className="admin-btn" onClick={addPressPhotoUrl}>
              {t('admin.addPhotoUrl')}
            </button>
            <label className="admin-btn">
              {t('admin.uploadFile')}
              <input type="file" accept="image/*" className="admin-file-hidden" onChange={onPressPhotoFile} />
            </label>
          </div>
          <span className="admin-field-hint">{t('admin.demoNotice')}</span>
        </div>

        <label className="admin-field">
          <span>{t('admin.contactEmail')}</span>
          <input type="email" className="admin-input" value={form.contactEmail || ''} onChange={(e) => set('contactEmail', e.target.value)} />
        </label>

        <div className="admin-form-actions">
          <button type="submit" className="admin-btn admin-btn-primary">{t('admin.saveSettings')}</button>
        </div>
      </form>

      <section className="admin-panel" aria-labelledby="admin-sotd-title">
        <h2 className="admin-panel-title" id="admin-sotd-title">{t('home.songOfTheDay')}</h2>
        <p className="admin-muted">{todayLabel}</p>
        <p className="admin-muted">{t('admin.songOfDayHint')}</p>
        <label className="admin-field">
          <span>{t('home.songOfTheDay')}</span>
          <select className="admin-input" value={sotdTrackId} onChange={(e) => setSotdTrackId(e.target.value)}>
            {sotdOptions.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.titleTa || tr.titleEn} — {tr.artist || ''}
              </option>
            ))}
          </select>
        </label>
        {sotdTrack && (
          <p className="admin-field-hint">
            {sotdTrack.titleTa || sotdTrack.titleEn}
            {sotdTrack.artist ? ` — ${sotdTrack.artist}` : ''}
          </p>
        )}
        <div className="admin-form-actions">
          <button type="button" className="admin-btn admin-btn-primary" onClick={handleSaveSotd}>
            {t('common.save')}
          </button>
        </div>
        {effectiveSotd && (
          <p className="admin-muted">
            {t('admin.songOfDayCurrent', {
              title: `${effectiveSotd.titleTa || effectiveSotd.titleEn}${effectiveSotd.artist ? ` — ${effectiveSotd.artist}` : ''}`,
            })}
          </p>
        )}
      </section>
    </div>
  )
}
