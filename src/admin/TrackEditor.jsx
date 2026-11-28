// Track editor — create (/admin/tracks/new) and edit (/admin/tracks/:id/edit).
// Includes hookStartSec / hookDurationSec (Discover hook clip timing).
//
// Admin redesign, Section 4: the same save logic as before, restructured
// as a 6-step form (Basics · Media · Lyrics · Story & credits ·
// Preview hook · Publish) with a sticky save bar, 10s localStorage
// draft autosave (never Supabase), inline validation, drag-and-drop
// media, and a hook waveform scrubber. One `form` state object —
// steps only change what is rendered.
//
// Upload-progress honesty: the save is one opaque call
// (saveTrackToSupabase, no progress API; supabase-js storage upload
// takes no AbortSignal), so there is NO determinate upload
// percentage anywhere here — only the honest `saving` busy state.
// Pending file selections can be removed before save; a failed save
// shows a Retry button.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { tracks, albums as fallbackAlbums, artists as fallbackArtists, getTrack } from '../data/catalog.js'
import { useTrack, useAlbums, useArtists } from '../lib/supabaseCatalog.js'
import {
  supabaseWritesEnabled,
  saveTrackToSupabase,
  adminErrorMessage,
  validateAudioFile,
  validateCoverFile,
  withTimeout,
  SAVE_TIMEOUT_MS,
} from '../lib/supabaseAdmin.js'
import {
  getMergedTracks,
  logActivity,
  STATUS_LABEL_KEYS,
  GENRE_LABEL_KEYS,
  normalizeStatus,
} from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'
import { useToast } from '../lib/toast.jsx'
import FallbackBanner from './FallbackBanner.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import { useUnsavedGuard } from './hooks/useUnsavedGuard.jsx'
import {
  TRACK_EDITOR_STEPS,
  STEP_COUNT,
  TITLE_MAX_LENGTH,
  TEXT_MAX_LENGTH,
  validateStep,
  validateAllSteps,
  draftKey,
  serializeDraft,
  parseDraft,
  draftDiffers,
  formatDurationSec,
  computePeaks,
} from './lib/trackEditorSteps.js'
import './editor.css'

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
  story: '',
}

// Map a step-validation error code (trackEditorSteps.js) to a message.
function stepErrorMessage(code, t) {
  switch (code) {
    case 'titleRequired':
      return t('admin.titleRequired')
    case 'artistRequired':
      return t('admin.artistRequired')
    case 'titleTooLong':
      return t('admin.editorTitleTooLong')
    case 'textTooLong':
      return t('admin.editorTextTooLong')
    case 'hookInvalid':
      return t('admin.editorHookInvalid')
    case 'hookBeyondDuration':
      return t('admin.editorHookBeyond')
    case 'audioRequired':
      return t('admin.audioRequired')
    default:
      return ''
  }
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
  const { user, isAdmin } = useAuth()
  const { t } = useI18n()
  const showToast = useToast()
  const isNew = !id || id === 'new'

  // Supabase read layer (B1) first; static catalog + local overrides
  // are the fallback while it loads / when Supabase is unreachable.
  const { data: sbTrack, isLoading: trackLoading, refetch: refetchTrack } = useTrack(isNew ? null : id)
  const { data: sbAlbums, isLoading: albumsLoading, refetch: refetchAlbums } = useAlbums()
  const { data: sbArtists, isLoading: artistsLoading, refetch: refetchArtists } = useArtists()
  const albums = sbAlbums || fallbackAlbums
  const artists = sbArtists || fallbackArtists

  const localExisting = useMemo(() => {
    if (isNew) return null
    try {
      return getTrack(id) || getMergedTracks(tracks).find((tr) => tr.id === id) || null
    } catch {
      return getMergedTracks(tracks).find((tr) => tr.id === id) || null
    }
  }, [id, isNew])
  const existing = sbTrack ?? localExisting

  const [form, setForm] = useState(EMPTY_FORM)
  const [initialForm, setInitialForm] = useState(EMPTY_FORM)
  const [step, setStep] = useState(0)
  const [audioFile, setAudioFile] = useState(null)
  const [audioMeta, setAudioMeta] = useState(null)
  const [audioObjectUrl, setAudioObjectUrl] = useState('')
  const [audioDurationSec, setAudioDurationSec] = useState(null)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [errors, setErrors] = useState({})
  const [warning, setWarning] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [draftPrompt, setDraftPrompt] = useState(null)
  const [autosavedAt, setAutosavedAt] = useState(null)
  const [audioDragOver, setAudioDragOver] = useState(false)
  const [coverDragOver, setCoverDragOver] = useState(false)
  const [peaks, setPeaks] = useState(null)
  const [hookPlaying, setHookPlaying] = useState(false)
  // Only initialise the form once per track id — the Supabase row
  // arriving after the static fallback must not wipe typed input.
  const initializedIdRef = useRef(null)
  const shownDraftRef = useRef(false)
  const pendingStatusRef = useRef(null)
  const formRef = useRef(null)
  const audioInputRef = useRef(null)
  const coverInputRef = useRef(null)
  const hookAudioRef = useRef(null)
  const hookTimerRef = useRef(null)
  const formRefLatest = useRef(form)
  formRefLatest.current = form

  // Dirty = the form (or a pending file) differs from the last
  // saved / initialised state. Drives the guard, the dot, autosave.
  const dirty =
    JSON.stringify(form) !== JSON.stringify(initialForm) ||
    audioFile !== null ||
    coverFile !== null
  const draftId = isNew ? 'new' : id
  const { UnsavedGuard } = useUnsavedGuard(dirty, draftId, formRefLatest)

  const hasAudio = Boolean(audioFile || audioMeta || existing?.audio128 || existing?.audio320)
  // Playable audio: the newly chosen file, else the stored track URL.
  const audioSrc = audioObjectUrl || existing?.audio128 || existing?.audio320 || ''

  const maybeOfferDraft = (baseForm) => {
    if (shownDraftRef.current) return
    try {
      const draft = parseDraft(localStorage.getItem(draftKey(draftId)))
      if (draft && draftDiffers(draft, baseForm)) {
        shownDraftRef.current = true
        setDraftPrompt(draft)
      }
    } catch {
      // Storage unavailable — the editor still works, just no draft.
    }
  }

  useEffect(() => {
    if (!existing) return
    if (initializedIdRef.current === existing.id) return
    initializedIdRef.current = existing.id
    const next = {
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
      // L31: the story field — it used to survive only via spread on
      // edit and could never be set on a new track.
      story: existing.storyTa || existing.story || '',
    }
    setForm(next)
    setInitialForm(next)
    if (existing.audioName) {
      setAudioMeta({ name: existing.audioName, size: existing.audioSize || 0 })
    }
    if (existing.cover) setCoverPreview(existing.cover)
    maybeOfferDraft(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing])

  // New tracks have no `existing` row, so the draft check runs here.
  useEffect(() => {
    if (isNew) maybeOfferDraft(EMPTY_FORM)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew])

  // Autosave draft to localStorage every 10s while dirty.
  // Form fields only — never files, never Supabase.
  useEffect(() => {
    if (!dirty) return undefined
    const timer = setInterval(() => {
      try {
        localStorage.setItem(draftKey(draftId), serializeDraft(formRefLatest.current))
        setAutosavedAt(Date.now())
      } catch {
        // Storage full / blocked — saving to Supabase still works.
      }
    }, 10000)
    return () => clearInterval(timer)
  }, [dirty, draftId])

  // Revoke object-URL previews on unmount / change.
  useEffect(() => {
    return () => {
      if (coverPreview && coverPreview.startsWith('blob:')) URL.revokeObjectURL(coverPreview)
    }
  }, [coverPreview])
  useEffect(() => {
    return () => {
      if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl)
    }
  }, [audioObjectUrl])
  useEffect(() => {
    return () => {
      if (hookTimerRef.current) clearTimeout(hookTimerRef.current)
    }
  }, [])

  // Audio duration auto-read (display only — the save path already
  // derives duration via the existing flow in supabaseAdmin.js).
  useEffect(() => {
    if (!audioSrc) {
      setAudioDurationSec(null)
      return undefined
    }
    let cancelled = false
    const audio = new Audio()
    const timer = setTimeout(() => {
      if (!cancelled) setAudioDurationSec(null)
    }, 8000)
    audio.onloadedmetadata = () => {
      clearTimeout(timer)
      if (!cancelled) {
        setAudioDurationSec(
          Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration) : null,
        )
      }
    }
    audio.onerror = () => {
      clearTimeout(timer)
      if (!cancelled) setAudioDurationSec(null)
    }
    audio.src = audioSrc
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [audioSrc])

  // Waveform: decode the audio when the hook step is shown. Any
  // failure (no AudioContext, undecodable file, fetch blocked) falls
  // back to the duration bar — never a broken step.
  useEffect(() => {
    if (step !== 4 || !audioSrc) {
      setPeaks(null)
      return undefined
    }
    let cancelled = false
    const decode = async () => {
      try {
        const buffer = audioFile
          ? await audioFile.arrayBuffer()
          : await (await fetch(audioSrc)).arrayBuffer()
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (!AudioCtx) return
        const ctx = new AudioCtx()
        try {
          const decoded = await ctx.decodeAudioData(buffer)
          if (!cancelled) setPeaks(computePeaks(decoded.getChannelData(0), 64))
        } finally {
          if (typeof ctx.close === 'function') void ctx.close()
        }
      } catch {
        if (!cancelled) setPeaks(null)
      }
    }
    void decode()
    return () => {
      cancelled = true
    }
  }, [step, audioSrc, audioFile])

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const onArtistChange = (artistId) => {
    const artist = artists.find((a) => a.id === artistId)
    setForm((f) => ({
      ...f,
      artistId,
      artist: artist ? artist.name || artist.nameEn || '' : f.artist,
    }))
  }

  const onAlbumChange = (albumId) => {
    const album = albums.find((a) => a.id === albumId)
    setForm((f) => ({
      ...f,
      albumId,
      album: album ? album.titleTa || album.titleEn || '' : f.album,
    }))
  }

  // Map an upload-validation error to a localised admin message.
  const validationMessage = (err, kind) => {
    if (err?.code === 'too-big') return t('admin.fileTooBig', { max: err.maxLabel || '25 MB' })
    return t(kind === 'audio' ? 'admin.audioInvalid' : 'admin.coverInvalid')
  }

  const acceptAudioFile = (file) => {
    if (!file) return
    try {
      validateAudioFile(file)
    } catch (err) {
      setErrors((e) => ({ ...e, audio: validationMessage(err, 'audio') }))
      return
    }
    setErrors((e) => ({ ...e, audio: undefined }))
    if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl)
    setAudioObjectUrl(URL.createObjectURL(file))
    setAudioFile(file)
    setAudioMeta({ name: file.name, size: file.size, type: file.type })
  }

  const acceptCoverFile = (file) => {
    if (!file) return
    try {
      validateCoverFile(file)
    } catch (err) {
      setErrors((e) => ({ ...e, cover: validationMessage(err, 'cover') }))
      return
    }
    setErrors((e) => ({ ...e, cover: undefined }))
    setCoverFile(file)
    if (coverPreview && coverPreview.startsWith('blob:')) URL.revokeObjectURL(coverPreview)
    setCoverPreview(URL.createObjectURL(file))
  }

  const onAudioChange = (e) => {
    acceptAudioFile(e.target.files?.[0])
    e.target.value = ''
  }

  const onCoverChange = (e) => {
    acceptCoverFile(e.target.files?.[0])
    e.target.value = ''
  }

  const removeAudioFile = () => {
    if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl)
    setAudioObjectUrl('')
    setAudioFile(null)
    setAudioDurationSec(null)
    setAudioMeta(
      existing?.audioName ? { name: existing.audioName, size: existing.audioSize || 0 } : null,
    )
    setErrors((e) => ({ ...e, audio: undefined }))
  }

  const removeCoverFile = () => {
    if (coverPreview && coverPreview.startsWith('blob:')) URL.revokeObjectURL(coverPreview)
    setCoverFile(null)
    setCoverPreview(existing?.cover || '')
    setErrors((e) => ({ ...e, cover: undefined }))
  }

  const dropFile = (e, accept) => {
    e.preventDefault()
    accept(e.dataTransfer?.files?.[0])
  }

  // Hook preview: plays ONLY the hook range, never the full track.
  const stopHook = () => {
    if (hookTimerRef.current) {
      clearTimeout(hookTimerRef.current)
      hookTimerRef.current = null
    }
    hookAudioRef.current?.pause()
    setHookPlaying(false)
  }

  const playHook = () => {
    const el = hookAudioRef.current
    if (!el || !audioSrc) return
    const start = Math.max(0, Number(form.hookStartSec) || 0)
    const duration = Math.max(1, Number(form.hookDurationSec) || 30)
    stopHook()
    el.currentTime = start
    void el.play().catch(() => setHookPlaying(false))
    setHookPlaying(true)
    hookTimerRef.current = setTimeout(stopHook, duration * 1000)
  }

  const mapErrors = (coded) => {
    const mapped = {}
    for (const [key, code] of Object.entries(coded)) {
      mapped[key] = stepErrorMessage(code, t)
    }
    return mapped
  }

  const stepHasError = (index) => {
    const stepDef = TRACK_EDITOR_STEPS[index]
    if (!stepDef) return false
    return stepDef.fields.some((field) => errors[field])
  }

  const goToStep = (index) => {
    stopHook()
    setStep(Math.max(0, Math.min(STEP_COUNT - 1, index)))
  }

  const goNext = () => {
    const stepDef = TRACK_EDITOR_STEPS[step]
    const coded = validateStep(stepDef.id, form, { hasAudio, durationSec: audioDurationSec })
    if (Object.keys(coded).length > 0) {
      setErrors((e) => ({ ...e, ...mapErrors(coded) }))
      return
    }
    goToStep(step + 1)
  }

  const clearDraft = () => {
    try {
      localStorage.removeItem(draftKey(draftId))
    } catch {
      // Ignore — the draft is a convenience, not the save.
    }
  }

  const restoreDraft = () => {
    if (!draftPrompt) return
    setForm({ ...EMPTY_FORM, ...draftPrompt.form })
    setDraftPrompt(null)
  }

  const discardDraft = () => {
    clearDraft()
    setDraftPrompt(null)
  }

  const handleSave = async (e) => {
    if (e) e.preventDefault()
    setSaveError('')
    setWarning('')
    // H3: defense in depth — RLS is the real gate.
    if (!isAdmin) {
      setSaveError(t('admin.notAdmin'))
      return
    }
    // The sticky bar sets this: Save draft -> 'draft', Publish ->
    // 'published'. A plain submit (Enter) keeps the form's status.
    const effectiveStatus = pendingStatusRef.current ?? form.status
    pendingStatusRef.current = null

    const coded = validateAllSteps(
      { ...form, status: effectiveStatus },
      { hasAudio, durationSec: audioDurationSec },
    )
    if (Object.keys(coded).length > 0) {
      const mapped = mapErrors(coded)
      setErrors(mapped)
      // Jump to the first step with a problem.
      const firstBad = TRACK_EDITOR_STEPS.findIndex((s) => s.fields.some((f) => mapped[f]))
      if (firstBad >= 0) goToStep(firstBad)
      return
    }

    setSaving(true)
    try {
      let coverDataUrl = existing?.cover || null
      if (coverFile) {
        try {
          coverDataUrl = await readFileAsDataUrl(coverFile)
        } catch {
          // M32: a cover that cannot be read must stop the save —
          // silently keeping the old cover lied about the new one.
          setSaveError(t('admin.coverReadFailed'))
          return
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
        status: normalizeStatus(effectiveStatus),
        scheduledAt: form.scheduledAt || null,
        hookStartSec: Math.max(0, Number(form.hookStartSec) || 0),
        hookDurationSec: Math.max(1, Number(form.hookDurationSec) || 30),
        lyricsTa: form.lyricsTa.split('\n').map((s) => s.trim()).filter(Boolean),
        lyricsEn: form.lyricsEn.split('\n').map((s) => s.trim()).filter(Boolean),
        description: form.description.trim(),
        story: form.story.trim(),
        storyTa: form.story.trim(),
        cover: coverDataUrl,
        plays: existing?.plays || 0,
        // Audio metadata only — the file itself goes to Supabase
        // Storage on save; the record shows what was uploaded.
        audioName: audioFile ? audioFile.name : existing?.audioName || null,
        audioSize: audioFile ? audioFile.size : existing?.audioSize || null,
      }

      // Supabase write path (B1): audio -> private "audio" bucket,
      // cover -> "covers" bucket, row + lyrics -> tables. A failed
      // write shows a clear message and does NOT fall back to
      // localStorage (that would fake a success).
      if (supabaseWritesEnabled()) {
        try {
          // C6: the whole save (uploads + row + lyrics) has an
          // overall timeout — a stalled upload used to hang the form
          // on "Saving…" forever with no error.
          const saved = await withTimeout(
            saveTrackToSupabase(track, { audioFile, coverFile }),
            SAVE_TIMEOUT_MS,
            'Track save',
          )
          logActivity({
            actor: user?.email || 'Admin',
            action: isNew ? 'Created track' : 'Updated track',
            detail: saved.titleTa || saved.titleEn || saved.id,
          })
          // H6: the toast is shown ONLY after the lyrics check —
          // one authoritative message, never success + lyrics-failure
          // together. M3: the track saved but the lyrics did not —
          // show the warning and STAY on the form (no navigation)
          // so the admin can retry the lyrics instead of believing
          // all is saved.
          if (saved.lyricsOk === false) {
            setWarning(t('admin.lyricsSaveFailed'))
            return
          }
          showToast(t('admin.editorSavedRow'))
          clearDraft()
          setInitialForm({ ...form, status: effectiveStatus })
          setAudioFile(null)
          setCoverFile(null)
          if (isNew) {
            navigate(`/admin/tracks/${saved.id}/edit`, { replace: true })
          }
        } catch (err) {
          setSaveError(err?.code === 'timeout' ? t('admin.saveTimeout') : adminErrorMessage(err, t))
        }
        return
      }

      // Admin is Supabase-only (27 Nov 2026): no local/demo fallback.
      // Without the database connection the save fails loudly instead
      // of pretending to succeed in this browser.
      setSaveError(t('admin.dbNotConnected'))
    } finally {
      setSaving(false)
    }
  }

  if (!isNew && !existing) {
    if (trackLoading) {
      return (
        <div className="admin-page">
          <div className="admin-empty">
            <h2>{t('common.loading')}</h2>
          </div>
        </div>
      )
    }
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

  const fieldError = (key) =>
    errors[key] ? (
      <span className="admin-field-error" role="alert">
        {errors[key]}
      </span>
    ) : null

  const taLines = form.lyricsTa.split('\n').map((s) => s.trim()).filter(Boolean)
  const enLines = form.lyricsEn.split('\n').map((s) => s.trim()).filter(Boolean)
  const hookStart = Math.max(0, Number(form.hookStartSec) || 0)
  const hookDuration = Math.max(1, Number(form.hookDurationSec) || 30)
  const previewTitle = form.titleTa.trim() || form.titleEn.trim()
  const previewDuration = audioDurationSec ? formatDurationSec(audioDurationSec) : t('admin.editorUnknownDuration')

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{t('admin.titleTa')} *</span>
                <input
                  className="admin-input"
                  value={form.titleTa}
                  onChange={(e) => set('titleTa', e.target.value)}
                  aria-required="true"
                  aria-invalid={Boolean(errors.titleTa)}
                  maxLength={TITLE_MAX_LENGTH + 20}
                />
                {fieldError('titleTa')}
                <span className={`track-editor__counter${form.titleTa.length > TITLE_MAX_LENGTH ? ' track-editor__counter--over' : ''}`}>
                  {form.titleTa.length}/{TITLE_MAX_LENGTH}
                </span>
              </label>
              <label className="admin-field">
                <span>{t('admin.titleEn')}</span>
                <input
                  className="admin-input"
                  value={form.titleEn}
                  onChange={(e) => set('titleEn', e.target.value)}
                  aria-invalid={Boolean(errors.titleEn)}
                  maxLength={TITLE_MAX_LENGTH + 20}
                />
                {fieldError('titleEn')}
                <span className={`track-editor__counter${form.titleEn.length > TITLE_MAX_LENGTH ? ' track-editor__counter--over' : ''}`}>
                  {form.titleEn.length}/{TITLE_MAX_LENGTH}
                </span>
              </label>
              <label className="admin-field">
                <span>{t('admin.artist')} *</span>
                <select
                  className="admin-input"
                  value={form.artistId}
                  onChange={(e) => onArtistChange(e.target.value)}
                  aria-required="true"
                  aria-invalid={Boolean(errors.artist)}
                >
                  <option value="">{t('admin.selectArtist')}</option>
                  {artists.map((a) => (
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
                {fieldError('artist')}
              </label>
              <label className="admin-field">
                <span>{t('admin.album')}</span>
                <select className="admin-input" value={form.albumId} onChange={(e) => onAlbumChange(e.target.value)}>
                  <option value="">{t('admin.noAlbum')}</option>
                  {albums.map((a) => (
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
                <input
                  type="date"
                  className="admin-input"
                  value={form.releaseDate || ''}
                  onChange={(e) => set('releaseDate', e.target.value)}
                />
              </label>
            </div>
          </>
        )
      case 1:
        return (
          <>
            <div className="admin-field">
              <span id="audio-label">{t('admin.audioFile')}</span>
              <div
                className={`track-editor__dropzone${audioDragOver ? ' track-editor__dropzone--over' : ''}`}
                role="button"
                tabIndex={0}
                aria-labelledby="audio-label"
                onClick={() => audioInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    audioInputRef.current?.click()
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setAudioDragOver(true)
                }}
                onDragLeave={() => setAudioDragOver(false)}
                onDrop={(e) => {
                  setAudioDragOver(false)
                  dropFile(e, acceptAudioFile)
                }}
              >
                <span className="track-editor__dropzone-text">{t('admin.editorDropAudio')}</span>
                <span className="track-editor__dropzone-hint">{t('admin.editorAudioHint')}</span>
                <span className="track-editor__dropzone-hint">{t('admin.editorBrowse')}</span>
              </div>
              <input
                ref={audioInputRef}
                type="file"
                accept=".mp3,.m4a,.wav,.ogg,.flac,audio/*"
                style={{ display: 'none' }}
                onChange={onAudioChange}
                aria-label={t('admin.audioFile')}
              />
              {fieldError('audio')}
              {audioMeta && (
                <div className="track-editor__file-row">
                  <span className="track-editor__file-name">{audioMeta.name}</span>
                  {audioMeta.size ? <span className="track-editor__file-meta">{formatBytes(audioMeta.size)}</span> : null}
                  {audioDurationSec != null && (
                    <span className="track-editor__file-meta">
                      {t('admin.editorDuration', { duration: formatDurationSec(audioDurationSec) })}
                    </span>
                  )}
                  {audioFile && (
                    <button type="button" className="track-editor__remove" onClick={removeAudioFile}>
                      {t('admin.editorRemoveFile')}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="admin-field">
              <span id="cover-label">{t('admin.coverFile')}</span>
              <div className="track-editor__cover-wrap">
                {coverPreview ? (
                  <img src={coverPreview} alt="" className="track-editor__cover-preview" />
                ) : (
                  <div className="track-editor__cover-empty">{t('admin.editorNoCover')}</div>
                )}
                <div
                  className={`track-editor__dropzone${coverDragOver ? ' track-editor__dropzone--over' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-labelledby="cover-label"
                  onClick={() => coverInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      coverInputRef.current?.click()
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setCoverDragOver(true)
                  }}
                  onDragLeave={() => setCoverDragOver(false)}
                  onDrop={(e) => {
                    setCoverDragOver(false)
                    dropFile(e, acceptCoverFile)
                  }}
                >
                  <span className="track-editor__dropzone-text">{t('admin.editorDropCover')}</span>
                  <span className="track-editor__dropzone-hint">{t('admin.editorCoverHint')}</span>
                  <span className="track-editor__dropzone-hint">{t('admin.editorBrowse')}</span>
                </div>
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={onCoverChange}
                aria-label={t('admin.coverFile')}
              />
              {fieldError('cover')}
              {coverFile && (
                <div className="track-editor__file-row">
                  <span className="track-editor__file-name">{coverFile.name}</span>
                  <span className="track-editor__file-meta">{formatBytes(coverFile.size)}</span>
                  <button type="button" className="track-editor__remove" onClick={removeCoverFile}>
                    {t('admin.editorRemoveFile')}
                  </button>
                </div>
              )}
            </div>
          </>
        )
      case 2:
        return (
          <div className="track-editor__lyrics-grid">
            <div className="track-editor__step-panel">
              <label className="admin-field">
                <span>{t('admin.lyricsTa')}</span>
                <textarea
                  className="admin-input admin-textarea"
                  rows={10}
                  value={form.lyricsTa}
                  onChange={(e) => set('lyricsTa', e.target.value)}
                />
              </label>
              <label className="admin-field">
                <span>{t('admin.lyricsEn')}</span>
                <textarea
                  className="admin-input admin-textarea"
                  rows={10}
                  value={form.lyricsEn}
                  onChange={(e) => set('lyricsEn', e.target.value)}
                />
              </label>
            </div>
            <div className="track-editor__lyrics-preview" aria-live="polite">
              <h3>{t('admin.editorLyricsPreview')}</h3>
              {taLines.length === 0 && enLines.length === 0 && (
                <p className="track-editor__lyrics-empty">{t('admin.editorNoLyrics')}</p>
              )}
              {taLines.length > 0 && (
                <>
                  <h3>{t('admin.lyricsTa')}</h3>
                  <ol className="track-editor__lyrics-lines">
                    {taLines.map((line, i) => (
                      <li key={`ta-${i}`}>{line}</li>
                    ))}
                  </ol>
                </>
              )}
              {enLines.length > 0 && (
                <>
                  <h3>{t('admin.lyricsEn')}</h3>
                  <ol className="track-editor__lyrics-lines">
                    {enLines.map((line, i) => (
                      <li key={`en-${i}`}>{line}</li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          </div>
        )
      case 3:
        return (
          <>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{t('admin.lyricist')}</span>
                <input className="admin-input" value={form.lyricist} onChange={(e) => set('lyricist', e.target.value)} />
              </label>
              <label className="admin-field">
                <span>{t('admin.composer')}</span>
                <input className="admin-input" value={form.composer} onChange={(e) => set('composer', e.target.value)} />
              </label>
              <label className="admin-field">
                <span>{t('admin.featuredArtists')}</span>
                <input className="admin-input" value={form.featuredArtists} onChange={(e) => set('featuredArtists', e.target.value)} />
                {supabaseWritesEnabled() && (
                  <span className="admin-field-hint">{t('admin.featuredArtistsNotStored')}</span>
                )}
              </label>
            </div>
            <label className="admin-field">
              <span>{t('admin.description')}</span>
              <textarea
                className="admin-input admin-textarea"
                rows={3}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                aria-invalid={Boolean(errors.description)}
                maxLength={TEXT_MAX_LENGTH + 100}
              />
              {fieldError('description')}
              <span className={`track-editor__counter${form.description.length > TEXT_MAX_LENGTH ? ' track-editor__counter--over' : ''}`}>
                {form.description.length}/{TEXT_MAX_LENGTH}
              </span>
            </label>
            <label className="admin-field">
              <span>{t('admin.story')}</span>
              <textarea
                className="admin-input admin-textarea"
                rows={3}
                value={form.story}
                onChange={(e) => set('story', e.target.value)}
                aria-invalid={Boolean(errors.story)}
                maxLength={TEXT_MAX_LENGTH + 100}
              />
              {fieldError('story')}
              <span className={`track-editor__counter${form.story.length > TEXT_MAX_LENGTH ? ' track-editor__counter--over' : ''}`}>
                {form.story.length}/{TEXT_MAX_LENGTH}
              </span>
            </label>
          </>
        )
      case 4:
        return (
          <>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{t('admin.hookStart')}</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="admin-input"
                  value={form.hookStartSec}
                  onChange={(e) => set('hookStartSec', e.target.value)}
                  aria-invalid={Boolean(errors.hookStartSec)}
                />
                <span className="admin-field-hint">{t('admin.hookStartHint')}</span>
                {fieldError('hookStartSec')}
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
                  aria-invalid={Boolean(errors.hookDurationSec)}
                />
                {fieldError('hookDurationSec')}
              </label>
            </div>
            <div className="track-editor__waveform">
              {audioSrc ? (
                peaks ? (
                  <svg
                    viewBox="0 0 640 96"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={t('admin.editorHookRange', { start: hookStart, end: hookStart + hookDuration })}
                  >
                    {peaks.map((peak, i) => {
                      const barWidth = 640 / peaks.length
                      const height = Math.max(2, peak * 88)
                      return (
                        <rect
                          key={i}
                          x={i * barWidth + 1}
                          y={(96 - height) / 2}
                          width={Math.max(1, barWidth - 2)}
                          height={height}
                          rx="1"
                          fill="#64748B"
                        />
                      )
                    })}
                    {audioDurationSec ? (
                      <line
                        x1={(hookStart / audioDurationSec) * 640}
                        y1="0"
                        x2={(hookStart / audioDurationSec) * 640}
                        y2="96"
                        stroke="#F59E0B"
                        strokeWidth="3"
                      />
                    ) : null}
                  </svg>
                ) : (
                  <div className="track-editor__waveform-bar" aria-hidden="true">
                    {audioDurationSec ? (
                      <div
                        className="track-editor__waveform-fill"
                        style={{
                          left: `${Math.min(100, (hookStart / audioDurationSec) * 100)}%`,
                          width: `${Math.min(100 - (hookStart / audioDurationSec) * 100, (hookDuration / audioDurationSec) * 100)}%`,
                        }}
                      />
                    ) : null}
                  </div>
                )
              ) : (
                <p className="track-editor__lyrics-empty">{t('admin.editorHookNoAudio')}</p>
              )}
              {audioSrc && (
                <div className="track-editor__waveform-marks" aria-hidden="true">
                  <span>0:00</span>
                  {audioDurationSec ? <span>{formatDurationSec(audioDurationSec / 2)}</span> : null}
                  <span>{audioDurationSec ? formatDurationSec(audioDurationSec) : t('admin.editorUnknownDuration')}</span>
                </div>
              )}
              <div className="track-editor__hook-actions">
                <button
                  type="button"
                  className="admin-btn admin-btn-primary track-editor__bar-btn"
                  onClick={hookPlaying ? stopHook : playHook}
                  disabled={!audioSrc}
                >
                  {hookPlaying ? t('admin.editorStopPreview') : t('admin.editorPlayPreview')}
                </button>
                {audioSrc && (
                  <span className="track-editor__hook-range">
                    {t('admin.editorHookRange', { start: hookStart, end: hookStart + hookDuration })}
                  </span>
                )}
              </div>
              <audio ref={hookAudioRef} src={audioSrc || undefined} preload="metadata" />
            </div>
          </>
        )
      case 5:
        return (
          <>
            <div className="admin-form-grid">
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
                {form.status === 'scheduled' && (
                  <span className="admin-field-hint">{t('admin.scheduledNoAutoPublish')}</span>
                )}
              </label>
            </div>
            {fieldError('audio')}
            <div>
              <h3 className="admin-field-label">{t('admin.editorPreviewTitle')}</h3>
              <div className="track-editor__preview-card">
                {coverPreview ? (
                  <img src={coverPreview} alt="" className="track-editor__preview-cover" />
                ) : (
                  <div className="track-editor__preview-cover track-editor__preview-cover--empty" aria-hidden="true">
                    N
                  </div>
                )}
                <div className="track-editor__preview-text">
                  <div className="track-editor__preview-title">
                    {previewTitle || '—'}
                  </div>
                  {form.titleTa.trim() && form.titleEn.trim() && (
                    <div className="track-editor__preview-sub">{form.titleEn.trim()}</div>
                  )}
                  <div className="track-editor__preview-sub">
                    {form.artist.trim()}
                    {form.album.trim() ? ` · ${form.album.trim()}` : ''}
                    {` · ${previewDuration}`}
                  </div>
                  <span className="track-editor__chip">{t(STATUS_LABEL_KEYS[form.status])}</span>
                </div>
              </div>
            </div>
          </>
        )
      default:
        return null
    }
  }

  const currentStepDef = TRACK_EDITOR_STEPS[step]

  return (
    <div className="admin-page track-editor">
      <div className="track-editor__head">
        <Link to="/admin/tracks" className="track-editor__back">
          ← {t('admin.backToTracks')}
        </Link>
        <div className="track-editor__head-text">
          <h1 className="admin-title">{isNew ? t('admin.newTrack') : t('admin.editTrack')}</h1>
          {!isNew && (
            <p className="admin-subtitle">{existing?.titleTa || existing?.titleEn || id}</p>
          )}
        </div>
      </div>

      {saveError && (
        <div className="admin-notice admin-notice-warn track-editor__save-error" role="alert" aria-live="polite">
          <span>{saveError}</span>
          <button
            type="button"
            className="track-editor__retry"
            onClick={() => formRef.current?.requestSubmit()}
            disabled={saving}
          >
            {t('admin.editorRetry')}
          </button>
        </div>
      )}
      {warning && <div className="admin-notice admin-notice-warn" role="status" aria-live="polite">{warning}</div>}

      <FallbackBanner
        loading={trackLoading || albumsLoading || artistsLoading}
        onRetry={() => {
          void refetchTrack()
          void refetchAlbums()
          void refetchArtists()
        }}
      />

      <form ref={formRef} className="admin-form" onSubmit={handleSave} noValidate>
        <UnsavedGuard />
        {draftPrompt && (
          <ConfirmDialog
            open
            title={t('admin.editorRestoreTitle')}
            body={t('admin.editorRestoreBody', {
              time: new Date(draftPrompt.savedAt).toLocaleString(),
            })}
            confirmLabel={t('admin.editorRestore')}
            cancelLabel={t('admin.editorDiscardDraft')}
            onConfirm={restoreDraft}
            onCancel={discardDraft}
          />
        )}

        <div className="track-editor__steps" role="tablist" aria-label={t('admin.editTrack')}>
          {TRACK_EDITOR_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-current={i === step ? 'step' : undefined}
              className={`track-editor__step${i === step ? ' track-editor__step--active' : ''}${i < step && !stepHasError(i) ? ' track-editor__step--done' : ''}${stepHasError(i) ? ' track-editor__step--error' : ''}`}
              onClick={() => goToStep(i)}
            >
              <span className="track-editor__step-num" aria-hidden="true">{i + 1}</span>
              {t(s.labelKey)}
            </button>
          ))}
        </div>
        <p className="track-editor__mobile-step" aria-live="polite">
          {t('admin.editorStepOf', { n: step + 1, name: t(currentStepDef.labelKey) })}
        </p>

        <div className="track-editor__step-panel">{renderStep()}</div>

        <div className="track-editor__step-nav">
          <button
            type="button"
            className="admin-btn admin-btn-ghost"
            onClick={() => goToStep(step - 1)}
            disabled={step === 0}
          >
            {t('admin.editorPrevious')}
          </button>
          {step < STEP_COUNT - 1 && (
            <button type="button" className="admin-btn admin-btn-primary" onClick={goNext}>
              {t('admin.editorNext')}
            </button>
          )}
        </div>

        <div className="track-editor__bar">
          {dirty && (
            <span className="track-editor__dirty">
              <span className="track-editor__dirty-dot" aria-hidden="true" />
              {t('admin.editorUnsaved')}
            </span>
          )}
          <button
            type="submit"
            className="admin-btn admin-btn-ghost track-editor__bar-btn"
            disabled={saving}
            onClick={() => {
              pendingStatusRef.current = 'draft'
            }}
          >
            {saving ? t('common.saving') : t('admin.editorSaveDraft')}
          </button>
          <button
            type="submit"
            className="admin-btn admin-btn-primary track-editor__bar-btn"
            disabled={saving}
            onClick={() => {
              pendingStatusRef.current = 'published'
            }}
          >
            {saving ? t('common.saving') : t('admin.editorPublish')}
          </button>
          <Link to="/admin/tracks" className="admin-btn admin-btn-ghost track-editor__bar-btn">
            {t('common.cancel')}
          </Link>
          {autosavedAt && (
            <span className="track-editor__autosaved">
              {t('admin.editorDraftAutosaved', { time: new Date(autosavedAt).toLocaleTimeString() })}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
