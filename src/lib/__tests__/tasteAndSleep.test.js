// Hidden tracks + recent searches — localStorage-backed helpers.
// Node env has no localStorage/window, so both are stubbed per test.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { getHiddenIds, isHidden, hideTrack, unhideTrack } from '../hiddenTracks.js'
import { getRecentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches } from '../recentSearches.js'
import { sleepEndsAt, sleepRemainingMs, formatSleepRemaining, SLEEP_OPTIONS_MINUTES, loadSleepDefault, saveSleepDefault } from '../sleepTimer.js'

function stubStorage() {
  const store = new Map()
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { dispatchEvent: vi.fn() })
  return store
}

describe('hiddenTracks', () => {
  beforeEach(() => stubStorage())
  afterEach(() => vi.unstubAllGlobals())

  it('hides, unhides, and survives a reload', () => {
    expect(isHidden('a')).toBe(false)
    hideTrack('a')
    expect(isHidden('a')).toBe(true)
    expect(getHiddenIds()).toEqual(new Set(['a']))
    hideTrack('a')
    hideTrack('b')
    unhideTrack('a')
    expect([...getHiddenIds()]).toEqual(['b'])
  })
})

describe('recentSearches', () => {
  beforeEach(() => stubStorage())
  afterEach(() => vi.unstubAllGlobals())

  it('keeps most-recent-first, de-duplicates, caps at 8', () => {
    expect(getRecentSearches()).toEqual([])
    addRecentSearch('  vaazhvinil  ')
    addRecentSearch('melody')
    addRecentSearch('VAAZHVINIL')
    expect(getRecentSearches()).toEqual(['VAAZHVINIL', 'melody'])
    for (let i = 0; i < 9; i += 1) addRecentSearch(`q${i}`)
    expect(getRecentSearches()).toHaveLength(8)
    expect(getRecentSearches()[0]).toBe('q8')
    removeRecentSearch('q8')
    expect(getRecentSearches()).not.toContain('q8')
    clearRecentSearches()
    expect(getRecentSearches()).toEqual([])
  })
})

describe('sleepTimer helpers', () => {
  it('computes end, remaining and mm:ss', () => {
    expect(SLEEP_OPTIONS_MINUTES).toEqual([5, 10, 15, 30, 60])
    expect(sleepEndsAt(10, 1000)).toBe(1000 + 10 * 60000)
    expect(sleepRemainingMs(70000, 10000)).toBe(60000)
    expect(sleepRemainingMs(1000, 5000)).toBe(0)
    expect(formatSleepRemaining(60000)).toBe('1:00')
    expect(formatSleepRemaining(61000)).toBe('1:01')
    expect(formatSleepRemaining(500)).toBe('0:01')
    expect(formatSleepRemaining(0)).toBe('0:00')
  })
})

describe('sleepTimer default (item 7)', () => {
  it('defaults to off, round-trips minutes and end-of-track, rejects junk', () => {
    const store = stubStorage()
    expect(loadSleepDefault()).toBe('off')
    saveSleepDefault(15)
    expect(loadSleepDefault()).toBe(15)
    saveSleepDefault('end')
    expect(loadSleepDefault()).toBe('end')
    saveSleepDefault('off')
    expect(loadSleepDefault()).toBe('off')
    store.set('nandha-sleep-default', '45')
    expect(loadSleepDefault()).toBe('off')
    store.set('nandha-sleep-default', 'nonsense')
    expect(loadSleepDefault()).toBe('off')
  })
})
