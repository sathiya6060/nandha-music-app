// Synced lyrics admin — per-track lines with timestamps (mm:ss).
import { useMemo, useState } from 'react'
import { tracks as catalogTracks } from '../data/catalog.js'
import { useTracks, fetchLyricsForTrack } from '../lib/supabaseCatalog.js'
import {
  supabaseWritesEnabled,
  saveLyricsToSupabase,
  adminErrorMessage,
} from '../lib/supabaseAdmin.js'
import {
  getMergedTracks,
  loadSyncedLyrics,
  logActivity,
} from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'

const TIME_RE = /^\d{1,2}:\d{2}$/

function linesFromTrack(track) {
  if (!track) return []
  const ta = Array.isArray(track.lyricsTa) ? track.lyricsTa : []
  const en = Array.isArray(track.lyricsEn) ? track.lyricsEn : []
  const count = Math.max(ta.length, en.length)
  return Array.from({ length: count }, (_, i) => ({
    time: '',
    ta: ta[i] || '',
    en: en[i] || '',
  }))
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec == null) return ''
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

export default function LyricsAdmin() {
  const { user } = useAuth()
  const { t } = useI18n()
  // Supabase read layer (B1, all statuses for admin); static catalog +
  // local overrides are the fallback.
  const { data: sbTracks } = useTracks({ publishedOnly: false })
  const adminTracks = useMemo(
    () => getMergedTracks(sbTracks || catalogTracks).filter((tr) => tr.status !== 'deleted'),
    [sbTracks],
  )
  const [trackId, setTrackId] = useState('')
  const [lines, setLines] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const selectedTrack = adminTracks.find((tr) => tr.id === trackId) || null

  const pickTrack = async (id) => {
    setTrackId(id)
    setNotice('')
    setError('')
    if (!id) {
      setLines([])
      setLoaded(false)
      return
    }
    const track = adminTracks.find((tr) => tr.id === id)
    // Supabase path (B1): lyrics rows for the track's DB uuid.
    if (supabaseWritesEnabled() && track?.dbId) {
      try {
        const lyrics = await fetchLyricsForTrack(track.dbId)
        if (lyrics.synced) {
          setLines(lyrics.synced.map((l) => ({ time: formatTime(l.t), ta: l.ta || '', en: l.en || '' })))
        } else {
          const count = Math.max(lyrics.ta.length, lyrics.en.length)
          setLines(Array.from({ length: count }, (_, i) => ({
            time: '',
            ta: lyrics.ta[i] || '',
            en: lyrics.en[i] || '',
          })))
        }
        setLoaded(true)
        return
      } catch (err) {
        // Supabase fetch failed — show the error, then fall through
        // to the local copy below (shown for reference); saving still
        // goes to Supabase or fails loudly.
        setError(adminErrorMessage(err, t))
      }
    }
    const saved = loadSyncedLyrics()[id]
    if (saved?.lines) {
      setLines(saved.lines.map((l) => ({ time: l.time || '', ta: l.ta || '', en: l.en || '' })))
    } else {
      setLines(linesFromTrack(track))
    }
    setLoaded(true)
  }

  const updateLine = (index, key, value) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [key]: value } : l)))
  }

  const addLine = () => {
    setLines((prev) => {
      const last = prev[prev.length - 1]
      return [...prev, { time: last?.time || '00:00', ta: '', en: '' }]
    })
  }

  const removeLine = (index) => {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const moveLine = (index, dir) => {
    setLines((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const handleSave = async (e) => {
    e.preventDefault()
    const bad = lines.findIndex((l) => l.time && !TIME_RE.test(l.time.trim()))
    if (bad >= 0) {
      setError(t('admin.lyricsTimeError', { line: bad + 1 }))
      return
    }
    const cleaned = lines
      .map((l) => ({ time: l.time.trim(), ta: l.ta.trim(), en: l.en.trim() }))
      .filter((l) => l.ta || l.en)
    // Supabase path (B1): upsert lyrics rows (ta + en) for the track's
    // DB uuid. A failed write shows a clear message — no silent local
    // fallback.
    if (supabaseWritesEnabled() && selectedTrack?.dbId) {
      try {
        await saveLyricsToSupabase(selectedTrack.dbId, { lines: cleaned })
      } catch (err) {
        setError(adminErrorMessage(err, t))
        return
      }
      logActivity({ actor: user?.email || 'Admin', action: 'Edited synced lyrics', detail: selectedTrack?.titleTa || selectedTrack?.titleEn || trackId })
      setLines(cleaned)
      setError('')
      setNotice(t('admin.saved'))
      return
    }
    // Admin is Supabase-only (27 Nov 2026): no local fallback.
    setError(t('admin.dbNotConnected'))
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">{t('admin.lyrics')}</h1>
        </div>
      </div>

      {notice && <div className="admin-notice admin-notice-success" role="status" aria-live="polite">{notice}</div>}
      {error && <div className="admin-notice admin-notice-warn" role="status" aria-live="polite">{error}</div>}

      <div className="admin-toolbar">
        <select className="admin-input" value={trackId} onChange={(e) => pickTrack(e.target.value)} aria-label={t('admin.pickTrack')}>
          <option value="">{t('admin.pickTrack')}</option>
          {adminTracks.map((tr) => (
            <option key={tr.id} value={tr.id}>
              {tr.titleTa || tr.titleEn} — {tr.artist || ''}
            </option>
          ))}
        </select>
      </div>

      {!selectedTrack ? (
        <div className="admin-empty">
          <h2>{t('admin.noTrackSelected')}</h2>
          <p>{t('admin.pickTrack')}</p>
        </div>
      ) : (
        <form className="admin-form" onSubmit={handleSave} noValidate>
          <p className="admin-muted">
            {selectedTrack.titleTa || selectedTrack.titleEn}
            {selectedTrack.artist ? ` — ${selectedTrack.artist}` : ''}
          </p>
          <div className="admin-lyrics-list">
            {lines.map((line, i) => (
              <div key={i} className="admin-lyric-row">
                <input
                  className="admin-input admin-lyric-time"
                  value={line.time}
                  onChange={(e) => updateLine(i, 'time', e.target.value)}
                  placeholder="mm:ss"
                  aria-label={`mm:ss ${i + 1}`}
                />
                <input
                  className="admin-input"
                  value={line.ta}
                  onChange={(e) => updateLine(i, 'ta', e.target.value)}
                  placeholder={t('admin.lyricsTa')}
                  aria-label={`${t('admin.lyricsTa')} ${i + 1}`}
                />
                <input
                  className="admin-input"
                  value={line.en}
                  onChange={(e) => updateLine(i, 'en', e.target.value)}
                  placeholder={t('admin.lyricsEn')}
                  aria-label={`${t('admin.lyricsEn')} ${i + 1}`}
                />
                <span className="admin-order-actions">
                  <button type="button" className="admin-btn admin-btn-small" disabled={i === 0} onClick={() => moveLine(i, -1)}>{t('common.moveUp')}</button>
                  <button type="button" className="admin-btn admin-btn-small" disabled={i === lines.length - 1} onClick={() => moveLine(i, 1)}>{t('common.moveDown')}</button>
                  <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => removeLine(i)}>{t('common.remove')}</button>
                </span>
              </div>
            ))}
          </div>
          <div className="admin-form-actions">
            <button type="button" className="admin-btn" onClick={addLine}>
              {t('admin.addLine')}
            </button>
            <button type="submit" className="admin-btn admin-btn-primary" disabled={!loaded}>
              {t('admin.saveLyrics')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
