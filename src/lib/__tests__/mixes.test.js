// Rule-based mixes — pure-function tests (no ML, no fake data).
import { describe, expect, it } from 'vitest'
import {
  buildMix,
  getDaylist,
  getDaylistWindow,
  getRadioCandidates,
  getReleaseRadar,
  getWeeklyMix,
  getWeekKey,
  seededShuffle,
  visibleTracks,
  MIX_IDS,
} from '../mixes.js'

const A = { id: 'a', status: 'published', genre: 'Devotional', artist: 'Nandha Music', artistId: 'art-1', releaseDate: '2026-12-10', plays: 5 }
const B = { id: 'b', status: 'published', genre: 'Melody', artist: 'Nandha Music', artistId: 'art-1', releaseDate: '2026-11-20', plays: 2 }
const C = { id: 'c', status: 'published', genre: 'Love', artist: 'Siddha Guruji', artistId: 'art-2', releaseDate: '2026-11-01', plays: 9 }
const DRAFT = { id: 'd', status: 'draft', genre: 'Devotional', artist: 'Nandha Music', releaseDate: '2026-11-25', plays: 0 }
const CATALOG = [A, B, C, DRAFT]

describe('seededShuffle', () => {
  it('is deterministic for the same seed and rotates for another', () => {
    expect(seededShuffle(CATALOG, 'week-1')).toEqual(seededShuffle(CATALOG, 'week-1'))
    expect(seededShuffle(CATALOG, 'week-1').map((t) => t.id)).not.toEqual(
      seededShuffle(CATALOG, 'week-2').map((t) => t.id),
    )
    expect(seededShuffle(CATALOG, 'week-1')).toHaveLength(4)
  })
})

describe('visibleTracks', () => {
  it('drops drafts and hidden tracks, never invents any', () => {
    expect(visibleTracks(CATALOG, { hiddenIds: new Set(['b']) }).map((t) => t.id)).toEqual(['a', 'c'])
    expect(visibleTracks([], {})).toEqual([])
  })
})

describe('getWeekKey', () => {
  it('changes on Monday', () => {
    // 2026-11-30 is a Monday; 2026-11-29 is the Sunday before it.
    expect(getWeekKey(new Date(2026, 10, 30))).not.toBe(getWeekKey(new Date(2026, 10, 29)))
    expect(getWeekKey(new Date(2026, 10, 30))).toBe(getWeekKey(new Date(2026, 11, 2)))
  })
})

describe('getWeeklyMix', () => {
  it('puts liked tracks first and rotates weekly', () => {
    const monday = new Date(2026, 10, 30, 9, 0, 0)
    const mix = getWeeklyMix(CATALOG, { likedIds: new Set(['c']), date: monday })
    expect(mix[0].id).toBe('c')
    expect(mix.map((t) => t.id)).toEqual(expect.arrayContaining(['a', 'b', 'c']))
    expect(mix.some((t) => t.id === 'd')).toBe(false) // draft never in a mix
    const nextWeek = getWeeklyMix(CATALOG, { likedIds: new Set(['c']), date: new Date(2026, 11, 7, 9, 0, 0) })
    // Same liked-first head; the unliked tail rotates with the week seed.
    expect(nextWeek[0].id).toBe('c')
  })

  it('degrades gracefully to the single real track', () => {
    expect(getWeeklyMix([A], { date: new Date(2026, 10, 30) }).map((t) => t.id)).toEqual(['a'])
    expect(getWeeklyMix([], {})).toEqual([])
  })

  it('excludes hidden tracks', () => {
    expect(getWeeklyMix(CATALOG, { likedIds: new Set(), hiddenIds: new Set(['a', 'c']), date: new Date(2026, 10, 30) }).map((t) => t.id)).toEqual(['b'])
  })
})

describe('getReleaseRadar', () => {
  it('returns fresh releases and flags the fallback honestly', () => {
    // 27 Nov 2026: B (20 Nov) is inside 21 days, C (1 Nov) is not.
    const fresh = getReleaseRadar(CATALOG, { date: new Date(2026, 10, 27) })
    expect(fresh.isFallback).toBe(false)
    expect(fresh.tracks.map((t) => t.id)).toEqual(['b'])
    // A is dated in the future (10 Dec) — never "fresh" before release.
    const old = getReleaseRadar(CATALOG, { date: new Date(2027, 0, 15) })
    expect(old.isFallback).toBe(true)
    expect(old.tracks[0].id).toBe('a') // newest first
  })

  it('respects followed artists when any are followed', () => {
    // C (1 Nov, art-2) is outside the 21-day window, so the radar falls
    // back to the newest track from the followed artist — honestly.
    const radar = getReleaseRadar(CATALOG, { followedArtistIds: new Set(['art-2']), date: new Date(2026, 10, 27) })
    expect(radar.tracks.map((t) => t.id)).toEqual(['c'])
    expect(radar.isFallback).toBe(true)
  })

  it('never treats an unparseable release date as fresh (S7773: Number.NaN)', () => {
    const badDate = { ...A, id: 'bad', releaseDate: 'not-a-date' }
    const radar = getReleaseRadar([badDate, B], { date: new Date(2026, 10, 27) })
    // B (20 Nov) is the only fresh track; the bad-date track falls
    // through to the newest-first fallback ordering, never "fresh".
    expect(radar.isFallback).toBe(false)
    expect(radar.tracks.map((t) => t.id)).toEqual(['b'])
  })
})

describe('getDaylist', () => {
  it('changes window through the day and filters by genre', () => {
    expect(getDaylistWindow(new Date(2026, 10, 27, 6, 0, 0)).key).toBe('early-morning')
    expect(getDaylistWindow(new Date(2026, 10, 27, 12, 0, 0)).key).toBe('midday')
    expect(getDaylistWindow(new Date(2026, 10, 27, 19, 0, 0)).key).toBe('evening')
    expect(getDaylistWindow(new Date(2026, 10, 27, 23, 0, 0)).key).toBe('night')
    const morning = getDaylist(CATALOG, { date: new Date(2026, 10, 27, 6, 30, 0) })
    expect(morning.tracks.map((t) => t.id)).toEqual(['a'])
    const evening = getDaylist(CATALOG, { date: new Date(2026, 10, 27, 19, 30, 0) })
    expect(evening.tracks.map((t) => t.id)).toEqual(['c'])
  })
})

describe('getRadioCandidates', () => {
  it('ranks same-genre first and never returns the seed or hidden tracks', () => {
    const seed = { ...A, genre: 'Devotional' }
    const out = getRadioCandidates([A, B, C, { ...B, id: 'b2', genre: 'Devotional' }], seed, { hiddenIds: new Set(['b2']) })
    expect(out.map((t) => t.id)).toEqual(['b', 'c'])
    expect(getRadioCandidates([A], A, {})).toEqual([]) // 1-track catalog: honestly empty
  })
})

describe('buildMix', () => {
  it('dispatches every mix id', () => {
    const ctx = { likedIds: new Set(), hiddenIds: new Set(), date: new Date(2026, 10, 27, 12, 0, 0) }
    expect(buildMix(MIX_IDS.WEEKLY, CATALOG, ctx).tracks.length).toBe(3)
    expect(buildMix(MIX_IDS.RADAR, CATALOG, ctx).tracks.length).toBeGreaterThan(0)
    expect(buildMix(MIX_IDS.DAYLIST, CATALOG, ctx).tracks.length).toBe(1)
    expect(buildMix(MIX_IDS.DAILY, CATALOG, ctx).tracks.length).toBeGreaterThan(0)
  })
})
