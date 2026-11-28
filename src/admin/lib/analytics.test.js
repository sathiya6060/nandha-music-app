// Admin redesign — dashboard/analytics/settings pure helpers.
import { describe, it, expect } from 'vitest'
import {
  bucketisePlaysByDay,
  totalPlays,
  aggregateTopTracks,
  deriveNeedsAttention,
  changedFieldKeys,
  xLabelAnchor,
  sparklineX,
} from './analytics.js'

describe('bucketisePlaysByDay', () => {
  const now = new Date('2026-11-28T12:00:00')

  it('returns one zero-filled bucket per day, oldest first', () => {
    const buckets = bucketisePlaysByDay([], 7, now)
    expect(buckets).toHaveLength(7)
    expect(buckets[0].date).toBe('2026-11-22')
    expect(buckets[6].date).toBe('2026-11-28')
    expect(buckets.every((b) => b.plays === 0)).toBe(true)
  })

  it('sums count per day and ignores out-of-window rows', () => {
    const events = [
      { played_at: '2026-11-28T09:00:00', count: 2 },
      { played_at: '2026-11-28T10:00:00' }, // count defaults to 1
      { played_at: '2026-11-27T23:59:00', count: 5 },
      { played_at: '2026-11-20T12:00:00', count: 99 }, // outside 7d
      { played_at: 'not-a-date', count: 7 },
      null,
    ]
    const buckets = bucketisePlaysByDay(events, 7, now)
    expect(buckets[6].plays).toBe(3)
    expect(buckets[5].plays).toBe(5)
    expect(totalPlays(buckets)).toBe(8)
  })
})

describe('aggregateTopTracks', () => {
  it('sums by track, sorts desc, skips unknown ids', () => {
    const titles = new Map([
      ['a', 'Song A'],
      ['b', 'Song B'],
    ])
    const events = [
      { track_id: 'a', count: 3 },
      { track_id: 'b', count: 1 },
      { track_id: 'a' },
      { track_id: 'gone', count: 50 }, // deleted track — no title
      { track_id: null, count: 9 },
    ]
    expect(aggregateTopTracks(events, titles, 10)).toEqual([
      { id: 'a', label: 'Song A', plays: 4 },
      { id: 'b', label: 'Song B', plays: 1 },
    ])
  })
})

describe('deriveNeedsAttention', () => {
  const now = new Date('2026-11-28T12:00:00')
  const full = {
    id: 'ok',
    titleTa: 'OK Song',
    status: 'published',
    cover: '/c.jpg',
    audio128: '/a.mp3',
    lyricsTa: ['line'],
    lyricsEn: [],
  }

  it('returns nothing for a complete track', () => {
    expect(deriveNeedsAttention([full], now)).toEqual([])
  })

  it('flags missing cover, audio and lyrics separately', () => {
    const bare = { id: 'bare', titleEn: 'Bare', status: 'draft' }
    const kinds = deriveNeedsAttention([bare], now).map((i) => i.kind)
    expect(kinds).toEqual(['missing-cover', 'missing-audio', 'missing-lyrics'])
  })

  it('treats audioName as having audio', () => {
    const t = { ...full, id: 'n', audio128: null, audio320: null, audioName: 'song.mp3' }
    expect(deriveNeedsAttention([t], now)).toEqual([])
  })

  it('flags scheduled releases within 7 days only', () => {
    const soon = { ...full, id: 's1', status: 'scheduled', scheduledAt: '2026-12-02T10:00:00' }
    const later = { ...full, id: 's2', status: 'scheduled', releaseDate: '2026-12-20' }
    const past = { ...full, id: 's3', status: 'scheduled', scheduledAt: '2026-11-01T10:00:00' }
    const found = deriveNeedsAttention([soon, later, past], now)
    expect(found.map((i) => i.trackId)).toEqual(['s1'])
    expect(found[0].kind).toBe('scheduled-soon')
  })

  it('skips deleted tracks', () => {
    const gone = { id: 'd', status: 'deleted' }
    expect(deriveNeedsAttention([gone], now)).toEqual([])
  })
})

describe('changedFieldKeys', () => {
  it('lists only changed keys, ignores updatedAt, deep-compares arrays', () => {
    const before = {
      bioEn: 'old',
      announcement: '',
      pressPhotos: ['a.jpg'],
      updatedAt: '2026-01-01',
    }
    const after = {
      bioEn: 'new',
      announcement: '',
      pressPhotos: ['a.jpg'],
      updatedAt: '2026-11-28',
    }
    expect(changedFieldKeys(before, after)).toEqual(['bioEn'])
    expect(changedFieldKeys(before, { ...before, pressPhotos: ['a.jpg', 'b.jpg'] })).toEqual([
      'pressPhotos',
    ])
    expect(changedFieldKeys(before, before)).toEqual([])
  })
})

describe('xLabelAnchor (28 Nov 2026)', () => {
  it('starts the first label at the axis and ends the last label at it', () => {
    expect(xLabelAnchor(0, 7)).toBe('start')
    expect(xLabelAnchor(6, 7)).toBe('end')
  })

  it('centres middle labels', () => {
    expect(xLabelAnchor(3, 7)).toBe('middle')
  })

  it('a single label is both first and last — start wins', () => {
    expect(xLabelAnchor(0, 1)).toBe('start')
  })
})

describe('sparklineX (28 Nov 2026)', () => {
  it('insets the first and last points by the dot radius so the last dot is not clipped', () => {
    expect(sparklineX(0, 7, 280)).toBe(4)
    expect(sparklineX(6, 7, 280)).toBe(276)
  })

  it('centres a single point', () => {
    expect(sparklineX(0, 1, 280)).toBe(140)
  })

  it('spaces points evenly between the insets', () => {
    expect(sparklineX(3, 7, 280)).toBe(140)
  })
})
