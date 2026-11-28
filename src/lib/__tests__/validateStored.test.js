// A3-6 (28 Nov 2026): schema validation for restored localStorage data.
// A tampered stored queue entry or admin override must be dropped, never
// played or merged.
import { describe, it, expect } from 'vitest'
import {
  isValidQueueEntry,
  sanitizeQueue,
  sanitizeTrackOverride,
  sanitizeAdminOverride,
} from '../validateStored.js'

describe('sanitizeQueue', () => {
  it('keeps valid queue entries', () => {
    const entries = [
      { id: 'vaazhvinil-orumurayenum', title: 'Vaazhvinil', audio128: '/assets/vaazhvinil-orumurayenum.mp3', durationSec: 224 },
      { id: 'malaiyoram', audio128: 'malaiyoram-veesiya-kaatre.mp3' },
    ]
    expect(sanitizeQueue(entries)).toEqual(entries)
  })

  it('drops entries with no id, a non-string id, or a forged non-string audio URL', () => {
    const entries = [
      { title: 'no id' },
      { id: 42, audio128: '/assets/x.mp3' },
      { id: 'bad-audio', audio128: { url: 'https://evil.example/x.mp3' } },
      { id: 'nested', audio128: '/assets/x.mp3', lyrics: { lines: [] } },
      { id: 'bad-duration', audio128: '/assets/x.mp3', durationSec: '224' },
      { id: 'good', audio128: '/assets/x.mp3' },
    ]
    expect(sanitizeQueue(entries)).toEqual([{ id: 'good', audio128: '/assets/x.mp3' }])
  })

  it('returns [] for non-array input', () => {
    expect(sanitizeQueue(null)).toEqual([])
    expect(sanitizeQueue({ queue: [] })).toEqual([])
    expect(sanitizeQueue('x')).toEqual([])
  })

  it('isValidQueueEntry rejects non-objects', () => {
    expect(isValidQueueEntry(null)).toBe(false)
    expect(isValidQueueEntry('x')).toBe(false)
    expect(isValidQueueEntry([])).toBe(false)
  })
})

describe('sanitizeTrackOverride', () => {
  it('keeps known fields with the right types', () => {
    const over = {
      id: 't1', title: 'Marakka', composer: 'Siddha Guruji',
      audio128: 'marakka.mp3', durationSec: 254, status: 'published',
      _tombstone: false, updatedAt: '2026-11-28T00:00:00.000Z',
    }
    expect(sanitizeTrackOverride(over)).toEqual(over)
  })

  it('drops unknown fields and wrongly-typed fields, keeps the rest', () => {
    const over = {
      id: 't1', title: 'Marakka', durationSec: '254',
      audio128: '/assets/x.mp3', evil: { nested: true }, plays: 'many',
    }
    expect(sanitizeTrackOverride(over)).toEqual({
      id: 't1', title: 'Marakka', audio128: '/assets/x.mp3',
    })
  })

  it('returns null for non-objects and overrides without a string id', () => {
    expect(sanitizeTrackOverride(null)).toBeNull()
    expect(sanitizeTrackOverride([])).toBeNull()
    expect(sanitizeTrackOverride({ title: 'no id' })).toBeNull()
    expect(sanitizeTrackOverride({ id: 7 })).toBeNull()
  })

  it('keeps _tombstone so soft-delete still works', () => {
    expect(sanitizeTrackOverride({ id: 't1', _tombstone: true })).toEqual({ id: 't1', _tombstone: true })
  })
})

describe('sanitizeAdminOverride', () => {
  it('keeps flat primitives, drops nested values', () => {
    expect(sanitizeAdminOverride({
      id: 'a1', title: 'Annamalaiyar', year: 2026, nested: { x: 1 }, list: [1],
    })).toEqual({ id: 'a1', title: 'Annamalaiyar', year: 2026 })
  })

  it('returns null without a string id', () => {
    expect(sanitizeAdminOverride({ title: 'x' })).toBeNull()
    expect(sanitizeAdminOverride(null)).toBeNull()
  })
})
