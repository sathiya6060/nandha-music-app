// Track editor steps — pure-function tests (admin redesign, Section 4).
import { describe, it, expect } from 'vitest'
import {
  TRACK_EDITOR_STEPS,
  STEP_COUNT,
  validateStep,
  validateAllSteps,
  draftKey,
  serializeDraft,
  parseDraft,
  draftDiffers,
  formatDurationSec,
  computePeaks,
} from './trackEditorSteps.js'

const validForm = {
  titleTa: 'மலையோரம்',
  titleEn: 'Malaiyoram',
  artistId: 'artist-1',
  artist: 'Nandha',
  albumId: '',
  album: '',
  genre: 'Melody',
  language: 'Tamil',
  releaseDate: '',
  status: 'draft',
  scheduledAt: '',
  hookStartSec: 10,
  hookDurationSec: 30,
  lyricsTa: '',
  lyricsEn: '',
  description: '',
  story: '',
}

describe('TRACK_EDITOR_STEPS', () => {
  it('has 6 steps in the specified order', () => {
    expect(STEP_COUNT).toBe(6)
    expect(TRACK_EDITOR_STEPS.map((s) => s.id)).toEqual([
      'basics',
      'media',
      'lyrics',
      'story',
      'hook',
      'publish',
    ])
  })

  it('gives every step a label key', () => {
    for (const step of TRACK_EDITOR_STEPS) {
      expect(step.labelKey).toMatch(/^admin\.editorStep/)
    }
  })
})

describe('validateStep — basics', () => {
  it('passes a valid basics form', () => {
    expect(validateStep('basics', validForm)).toEqual({})
  })

  it('requires a title in Tamil or English', () => {
    const errors = validateStep('basics', { ...validForm, titleTa: '', titleEn: '  ' })
    expect(errors.titleTa).toBe('titleRequired')
  })

  it('accepts an English-only title', () => {
    expect(validateStep('basics', { ...validForm, titleTa: '' })).toEqual({})
  })

  it('requires an artist (id or typed name)', () => {
    const errors = validateStep('basics', { ...validForm, artistId: '', artist: '' })
    expect(errors.artist).toBe('artistRequired')
    expect(validateStep('basics', { ...validForm, artistId: '', artist: 'Nandha' })).toEqual({})
  })

  it('rejects a title over 120 characters', () => {
    const errors = validateStep('basics', { ...validForm, titleTa: 'x'.repeat(121) })
    expect(errors.titleTa).toBe('titleTooLong')
    expect(validateStep('basics', { ...validForm, titleTa: 'x'.repeat(120) })).toEqual({})
  })
})

describe('validateStep — story', () => {
  it('rejects description / story over 2000 characters', () => {
    const errors = validateStep('story', { ...validForm, description: 'x'.repeat(2001), story: 'y'.repeat(2001) })
    expect(errors.description).toBe('textTooLong')
    expect(errors.story).toBe('textTooLong')
  })

  it('accepts exactly 2000 characters', () => {
    expect(validateStep('story', { ...validForm, description: 'x'.repeat(2000) })).toEqual({})
  })
})

describe('validateStep — hook', () => {
  it('passes valid hook numbers', () => {
    expect(validateStep('hook', validForm)).toEqual({})
  })

  it('rejects a negative start or a duration below 1', () => {
    expect(validateStep('hook', { ...validForm, hookStartSec: -1 }).hookStartSec).toBe('hookInvalid')
    expect(validateStep('hook', { ...validForm, hookDurationSec: 0 }).hookDurationSec).toBe('hookInvalid')
    expect(validateStep('hook', { ...validForm, hookStartSec: 'abc' }).hookStartSec).toBe('hookInvalid')
  })

  it('rejects a hook start beyond the known track duration', () => {
    const errors = validateStep('hook', { ...validForm, hookStartSec: 400 }, { durationSec: 300 })
    expect(errors.hookStartSec).toBe('hookBeyondDuration')
  })
})

describe('validateStep — publish', () => {
  it('blocks publishing without audio (existing rule)', () => {
    const errors = validateStep('publish', { ...validForm, status: 'published' }, { hasAudio: false })
    expect(errors.audio).toBe('audioRequired')
  })

  it('allows publishing with audio, and drafts without audio', () => {
    expect(validateStep('publish', { ...validForm, status: 'published' }, { hasAudio: true })).toEqual({})
    expect(validateStep('publish', { ...validForm, status: 'draft' }, { hasAudio: false })).toEqual({})
  })
})

describe('validateAllSteps', () => {
  it('merges errors from every step', () => {
    const errors = validateAllSteps(
      { ...validForm, titleTa: '', titleEn: '', artistId: '', artist: '', status: 'published' },
      { hasAudio: false },
    )
    expect(errors.titleTa).toBe('titleRequired')
    expect(errors.artist).toBe('artistRequired')
    expect(errors.audio).toBe('audioRequired')
  })

  it('passes a fully valid form', () => {
    expect(validateAllSteps(validForm, { hasAudio: true })).toEqual({})
  })
})

describe('draft helpers', () => {
  it('keys drafts per track id, with "new" for creates', () => {
    expect(draftKey('abc')).toBe('nandha-admin-track-draft-abc')
    expect(draftKey(null)).toBe('nandha-admin-track-draft-new')
    expect(draftKey(undefined)).toBe('nandha-admin-track-draft-new')
  })

  it('round-trips a draft through serialise / parse', () => {
    const parsed = parseDraft(serializeDraft(validForm))
    expect(parsed).not.toBeNull()
    expect(parsed.form).toEqual(validForm)
    expect(typeof parsed.savedAt).toBe('number')
  })

  it('rejects malformed or wrong-shaped drafts', () => {
    expect(parseDraft(null)).toBeNull()
    expect(parseDraft('not json')).toBeNull()
    expect(parseDraft(JSON.stringify({ form: 'nope' }))).toBeNull()
    expect(parseDraft(JSON.stringify({ savedAt: 1 }))).toBeNull()
  })

  it('detects when a draft differs from the form', () => {
    const draft = parseDraft(serializeDraft(validForm))
    expect(draftDiffers(draft, validForm)).toBe(false)
    expect(draftDiffers(draft, { ...validForm, titleTa: 'changed' })).toBe(true)
    expect(draftDiffers(null, validForm)).toBe(false)
  })
})

describe('formatDurationSec', () => {
  it('formats m:ss', () => {
    expect(formatDurationSec(0)).toBe('0:00')
    expect(formatDurationSec(65)).toBe('1:05')
    expect(formatDurationSec(351.3)).toBe('5:51')
  })
})

describe('computePeaks', () => {
  it('returns one peak per bucket, normalised to [0, 1]', () => {
    const data = new Float32Array([0.1, -0.5, 0.2, 0.9, -0.3, 0.0])
    const peaks = computePeaks(data, 3)
    expect(peaks).toHaveLength(3)
    expect(peaks[0]).toBeCloseTo(0.5)
    expect(peaks[1]).toBeCloseTo(0.9)
    expect(peaks[2]).toBeCloseTo(0.3)
  })

  it('returns [] for empty input', () => {
    expect(computePeaks(new Float32Array(0), 48)).toEqual([])
    expect(computePeaks(null, 48)).toEqual([])
  })
})
