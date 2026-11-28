// Plural i18n (N1) + locale parity (S10 smoke test).
import { describe, it, expect } from 'vitest'
import en from '../../locales/en.js'
import ta from '../../locales/ta.js'
import hi from '../../locales/hi.js'
import { pluralFormKey, isKnownLocale } from '../i18n.js'

describe('isKnownLocale (S8475 — localStorage language poisoning)', () => {
  it('accepts the three real locales', () => {
    expect(isKnownLocale('en')).toBe(true)
    expect(isKnownLocale('ta')).toBe(true)
    expect(isKnownLocale('hi')).toBe(true)
  })

  it('rejects prototype-chain keys that a plain lookup would accept', () => {
    // LOCALES['__proto__'] is Object.prototype (truthy) — an own-property
    // check is the whole fix; these must be false.
    expect(isKnownLocale('__proto__')).toBe(false)
    expect(isKnownLocale('constructor')).toBe(false)
    expect(isKnownLocale('prototype')).toBe(false)
  })

  it('rejects anything else', () => {
    expect(isKnownLocale('EN')).toBe(false)
    expect(isKnownLocale('fr')).toBe(false)
    expect(isKnownLocale('')).toBe(false)
    expect(isKnownLocale(null)).toBe(false)
    expect(isKnownLocale(undefined)).toBe(false)
    expect(isKnownLocale(123)).toBe(false)
  })
})

describe('plural i18n', () => {
  it('picks _one for 1 and _other for 0 / 2 / many', () => {
    expect(pluralFormKey('playlists.tracks', 1)).toBe('playlists.tracks_one')
    expect(pluralFormKey('playlists.tracks', 0)).toBe('playlists.tracks_other')
    expect(pluralFormKey('playlists.tracks', 2)).toBe('playlists.tracks_other')
    expect(pluralFormKey('album.tracks', 1)).toBe('album.tracks_one')
    expect(pluralFormKey('album.tracks', 5)).toBe('album.tracks_other')
  })

  it('has one/other forms for both track-count keys in all locales', () => {
    for (const locale of [en, ta, hi]) {
      for (const key of ['playlists.tracks', 'album.tracks']) {
        expect(locale[`${key}_one`]).toBeTruthy()
        expect(locale[`${key}_other`]).toContain('{{n}}')
      }
    }
  })

  it('renders "1 song" (not "1 songs") in English', () => {
    expect(en['playlists.tracks_one']).toBe('1 song')
    expect(en['album.tracks_one']).toBe('1 song')
    expect(en['playlists.tracks_other']).toBe('{{n}} songs')
  })

  it('has the day-0 streak copy and the honest notification label', () => {
    // Each locale says "local only" in its own words — the button must
    // never read as if push notifications work.
    expect(en['streak.daysZero']).toBe('Start your streak today')
    expect(en['streak.enableNotifications']).toMatch(/local only/i)
    expect(ta['streak.daysZero']).toBeTruthy()
    expect(ta['streak.enableNotifications']).toContain('உள்ளூர்')
    expect(hi['streak.daysZero']).toBeTruthy()
    expect(hi['streak.enableNotifications']).toContain('स्थानीय')
  })

  it('locale key parity holds (en/ta/hi have the same keys)', () => {
    const enKeys = Object.keys(en).sort()
    expect(Object.keys(ta).sort()).toEqual(enKeys)
    expect(Object.keys(hi).sort()).toEqual(enKeys)
    expect(enKeys.length).toBeGreaterThanOrEqual(322)
  })
})
