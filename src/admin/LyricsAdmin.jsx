// Synced lyrics admin — per-track lines with timestamps (mm:ss).
import { useMemo, useState } from 'react'
import { tracks as catalogTracks } from '../data/catalog.js'
import { useTracks } from '../lib/supabaseCatalog.js'
import { supabase } from '../lib/supabase.js'
import {
  supabaseWritesEnabled,
  saveLyricsToSupabase,
  adminErrorMessage,
  withTimeout,
  SAVE_TIMEOUT_MS,
} from '../lib/supabaseAdmin.js'
import { useToast } from '../lib/toast.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import './lists.css'
import {
  getMergedTracks,
  loadSyncedLyrics,
  logActivity,
} from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'
import FallbackBanner from './FallbackBanner.jsx'

const TIME_RE = /^\d{1,2}:\d{2}$/

// M29: fetch lyrics with an error that THROWS. fetchLyricsForTrack
// (supabaseCatalog.js) swallows read errors and returns empty, so a
// failed fetch used to fall through to the stale localStorage copy
// and let the admin save stale lines over newer DB rows. This local
// fetch maps the rows the same way, but a failure reaches the
// caller's catch — where the form stays unloaded and shows a retry.
async function fetchLyricsOrThrow(trackDbId) {
  const { data, error } = await supabase
    .from('lyrics')
    .select('lang, lines, synced')
    .eq('track_id', trackDbId)
  if (error) throw error
  const byLang = {}
  for (const row of data || []) byLang[row.lang] = row
  const toTexts = (row) =>
    (Array.isArray(row?.lines) ? row.lines : [])
      .map((l) => (typeof l === 'string' ? l : l?.text || ''))
      .filter(Boolean)
  const ta = toTexts(byLang.ta)
  const en = toTexts(byLang.en)
  let synced = null
  const syncedRow = byLang.ta || byLang.en
  if (syncedRow?.synced) {
    const taLines = Array.isArray(byLang.ta?.lines) ? byLang.ta.lines : []
    const enLines = Array.isArray(byLang.en?.lines) ? byLang.en.lines : []
    synced = taLines
      .map((l, i) => ({
        t: typeof l?.startSec === 'number' ? l.startSec : null,
        ta: typeof l === 'string' ? l : l?.text || '',
        en: typeof enLines[i] === 'string' ? enLines[i] : enLines[i]?.text || null,
      }))
      .filter((l) => l.ta || l.en)
    if (synced.length === 0) synced = null
  }
  return { ta, en, synced }
}

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
  const { user, isAdmin } = useAuth()
  const { t } = useI18n()
  // Supabase read layer (B1, all statuses for admin); static catalog +
  // local overrides are the fallback.
  const { data: sbTracks, isLoading: tracksLoading, refetch: refetchTracks } = useTracks({ publishedOnly: false })
  const adminTracks = useMemo(
    () => getMergedTracks(sbTracks || catalogTracks).filter((tr) => tr.status !== 'deleted'),
    [sbTracks],
  )
  const [trackId, setTrackId] = useState('')
  const [lines, setLines] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [confirmState, setConfirmState] = useState(null) // { kind: 'removeLine', index }
  const [error, setError] = useState('')
  const showToast = useToast()

  const selectedTrack = adminTracks.find((tr) => tr.id === trackId) || null

  const pickTrack = async (id) => {
    setTrackId(id)
    setError('')
    setLines([])
    setLoaded(false)
    if (!id) return
    setLyricsLoading(true)
    const track = adminTracks.find((tr) => tr.id === id)
    // Supabase path (B1): lyrics rows for the track's DB uuid.
    if (supabaseWritesEnabled() && track?.dbId) {
      try {
        const lyrics = await fetchLyricsOrThrow(track.dbId)
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
        setLyricsLoading(false)
        return
      } catch (err) {
        // M29: the fetch failed — show the error and STOP. Never fall
        // through to the stale local copy, and never let the admin
        // edit: loaded stays false, so Save stays disabled.
        setLyricsLoading(false)
        setError(`${t('admin.lyricsLoadFailed')} — ${adminErrorMessage(err, t)}`)
        return
      }
    }
    // No DB row for this track (fallback/static catalog) — the local
    // copy is all there is; saving still goes to Supabase or fails
    // loudly in handleSave.
    const saved = loadSyncedLyrics()[id]
    if (saved?.lines) {
      setLines(saved.lines.map((l) => ({ time: l.time || '', ta: l.ta || '', en: l.en || '' })))
    } else {
      setLines(linesFromTrack(track))
    }
    setLyricsLoading(false)
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

  // L33: removing a lyric line is destructive — confirm it.
  const removeLine = (index) => {
    setConfirmState({ kind: 'removeLine', index })
  }

  const doRemoveLine = (index) => {
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
    // H3: defense in depth — RLS is the real gate.
    if (!isAdmin) {
      setError(t('admin.notAdmin'))
      return
    }
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
        // C6: same timeout wrapper as TrackEditor — a stalled DB
        // write must not hang the form on "Saving…" forever.
        await withTimeout(
          saveLyricsToSupabase(selectedTrack.dbId, { lines: cleaned }),
          SAVE_TIMEOUT_MS,
          'Lyrics save',
        )
      } catch (err) {
        setError(err?.code === 'timeout' ? t('admin.saveTimeout') : adminErrorMessage(err, t))
        return
      }
      logActivity({ actor: user?.email || 'Admin', action: 'Edited synced lyrics', detail: selectedTrack?.titleTa || selectedTrack?.titleEn || trackId })
      setLines(cleaned)
      setError('')
      showToast(t('admin.saved'))
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

      {error && (
        <div className="admin-notice admin-notice-warn" role="status" aria-live="polite">
          {error}
          {trackId && (
            <button
              type="button"
              className="admin-btn admin-btn-small"
              onClick={() => void pickTrack(trackId)}
              style={{ marginLeft: 12 }}
            >
              {t('admin.fallbackRetry')}
            </button>
          )}
        </div>
      )}

      <FallbackBanner
        loading={tracksLoading}
        onRetry={() => void refetchTracks()}
      />

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
          {lyricsLoading ? (
            <div className="list-skeleton" aria-busy="true" aria-label={t('admin.loadingRows')}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="list-skeleton-row" />
              ))}
            </div>
          ) : (
          <div className="admin-lyrics-list">
            {lines.map((line, i) => (
              <div key={i} className="admin-lyric-row list-lyric-row">
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
          )}
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

      <ConfirmDialog
        open={confirmState?.kind === 'removeLine'}
        title={t('admin.confirmRemoveLine')}
        body={t('admin.deleteNoUndo')}
        confirmLabel={t('common.remove')}
        danger
        onConfirm={() => {
          const index = confirmState.index
          setConfirmState(null)
          doRemoveLine(index)
        }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  )
}
