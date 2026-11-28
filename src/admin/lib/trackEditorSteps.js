// Track editor steps (admin redesign, Section 4).
//
// Pure step definitions + per-step validation + localStorage draft
// helpers for TrackEditor.jsx. No DOM, no Supabase, no React —
// everything here is unit-tested in trackEditorSteps.test.js.
//
// Limits come from the real validators in src/lib/supabaseAdmin.js:
// audio MP3/M4A/WAV/OGG/FLAC ≤ 25 MB, cover JPG/PNG/WebP/GIF ≤ 10 MB.
// (The redesign prompt said 30 MB / 3 MB — the validators win.)

export const TRACK_EDITOR_STEPS = [
  { id: 'basics', labelKey: 'admin.editorStepBasics', fields: ['titleTa', 'titleEn', 'artistId', 'artist', 'albumId', 'album', 'genre', 'language', 'releaseDate'] },
  { id: 'media', labelKey: 'admin.editorStepMedia', fields: ['audio', 'cover'] },
  { id: 'lyrics', labelKey: 'admin.editorStepLyrics', fields: ['lyricsTa', 'lyricsEn'] },
  { id: 'story', labelKey: 'admin.editorStepStory', fields: ['lyricist', 'composer', 'featuredArtists', 'description', 'story'] },
  { id: 'hook', labelKey: 'admin.editorStepHook', fields: ['hookStartSec', 'hookDurationSec'] },
  { id: 'publish', labelKey: 'admin.editorStepPublish', fields: ['status', 'scheduledAt'] },
]

export const STEP_COUNT = TRACK_EDITOR_STEPS.length

export const TITLE_MAX_LENGTH = 120
export const TEXT_MAX_LENGTH = 2000

// Error codes returned by validateStep. The component maps each code
// to a locale string via t(); keeping codes here keeps this module
// free of i18n.
export const STEP_ERRORS = {
  TITLE_REQUIRED: 'titleRequired',
  ARTIST_REQUIRED: 'artistRequired',
  TITLE_TOO_LONG: 'titleTooLong',
  TEXT_TOO_LONG: 'textTooLong',
  HOOK_INVALID: 'hookInvalid',
  HOOK_BEYOND_DURATION: 'hookBeyondDuration',
  AUDIO_REQUIRED: 'audioRequired',
}

/**
 * Validate one step. `form` is the editor's single form object.
 * `opts.hasAudio` — a selected file, existing metadata, or a stored
 * audio URL counts. `opts.durationSec` — known track duration (from
 * the selected audio file), used only for the hook-beyond check.
 * Returns an errors object keyed by field ({} when the step is valid).
 */
export function validateStep(stepId, form, opts = {}) {
  const errors = {}
  const hasAudio = Boolean(opts.hasAudio)
  const durationSec = Number(opts.durationSec) || 0

  if (stepId === 'basics') {
    if (!String(form.titleTa || '').trim() && !String(form.titleEn || '').trim()) {
      errors.titleTa = STEP_ERRORS.TITLE_REQUIRED
    }
    if (String(form.titleTa || '').length > TITLE_MAX_LENGTH || String(form.titleEn || '').length > TITLE_MAX_LENGTH) {
      errors.titleTa = errors.titleTa || STEP_ERRORS.TITLE_TOO_LONG
      errors.titleEn = STEP_ERRORS.TITLE_TOO_LONG
    }
    if (!form.artistId && !String(form.artist || '').trim()) {
      errors.artist = STEP_ERRORS.ARTIST_REQUIRED
    }
  }

  if (stepId === 'story') {
    if (String(form.description || '').length > TEXT_MAX_LENGTH) {
      errors.description = STEP_ERRORS.TEXT_TOO_LONG
    }
    if (String(form.story || '').length > TEXT_MAX_LENGTH) {
      errors.story = STEP_ERRORS.TEXT_TOO_LONG
    }
  }

  if (stepId === 'hook') {
    const start = Number(form.hookStartSec)
    const duration = Number(form.hookDurationSec)
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration < 1) {
      errors.hookStartSec = STEP_ERRORS.HOOK_INVALID
      errors.hookDurationSec = STEP_ERRORS.HOOK_INVALID
    } else if (durationSec > 0 && start >= durationSec) {
      errors.hookStartSec = STEP_ERRORS.HOOK_BEYOND_DURATION
    }
  }

  if (stepId === 'publish') {
    const wantsPublish = form.status === 'published'
    if (wantsPublish && !hasAudio) {
      errors.audio = STEP_ERRORS.AUDIO_REQUIRED
    }
  }

  return errors
}

/** Validate every step (used by the final save); merges per-step errors. */
export function validateAllSteps(form, opts = {}) {
  const merged = {}
  for (const step of TRACK_EDITOR_STEPS) {
    Object.assign(merged, validateStep(step.id, form, opts))
  }
  return merged
}

/** localStorage draft key — one draft per track id ('new' for creates). */
export function draftKey(trackId) {
  return `nandha-admin-track-draft-${trackId || 'new'}`
}

/** Serialise a draft: form fields only, never files. */
export function serializeDraft(form) {
  return JSON.stringify({ savedAt: Date.now(), form })
}

/**
 * Parse a stored draft. Returns { savedAt, form } or null when the
 * payload is missing, malformed, or not an object of fields.
 */
export function parseDraft(raw) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !parsed.form || typeof parsed.form !== 'object') return null
    if (typeof parsed.savedAt !== 'number') return null
    return { savedAt: parsed.savedAt, form: parsed.form }
  } catch {
    return null
  }
}

/** True when the draft's fields differ from the given form. */
export function draftDiffers(draft, form) {
  if (!draft) return false
  return JSON.stringify(draft.form) !== JSON.stringify(form)
}

/** Format seconds as m:ss (audio duration display). */
export function formatDurationSec(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Downsample a channel's samples into `buckets` peak values in [0, 1]
 * for the waveform scrubber. Pure — no AudioContext here.
 */
export function computePeaks(channelData, buckets = 48) {
  if (!channelData || channelData.length === 0 || buckets <= 0) return []
  const block = Math.max(1, Math.floor(channelData.length / buckets))
  const peaks = []
  for (let i = 0; i < buckets; i += 1) {
    const start = i * block
    let max = 0
    for (let j = start; j < Math.min(start + block, channelData.length); j += 1) {
      const value = Math.abs(channelData[j])
      if (value > max) max = value
    }
    peaks.push(Math.min(1, max))
  }
  return peaks
}
