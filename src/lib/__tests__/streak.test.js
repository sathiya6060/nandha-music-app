// U-02 — streak + aarti alarm rules (pure localStorage-backed logic).
// The module reads localStorage/window at call time, so stub the globals
// and import it fresh per test (vi.resetModules) for isolation.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = new Map()
const localStorageStub = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}

let streak

beforeEach(async () => {
  store.clear()
  vi.stubGlobal('localStorage', localStorageStub)
  vi.stubGlobal('window', { dispatchEvent: () => {} })
  vi.stubGlobal('CustomEvent', class CustomEvent {
    constructor(type, opts) { this.type = type; this.detail = opts?.detail }
  })
  vi.resetModules()
  streak = await import('../streak.js')
})

const d = (iso) => new Date(`${iso}T12:00:00`)
// 23 Nov 2026 is a Monday — all dates below stay in the same week
// (Mon 23 – Sun 29 Nov 2026), so weekly forgiveness never resets mid-test.

describe('streak', () => {
  it('starts empty', () => {
    expect(streak.getStreak()).toEqual({ count: 0, lastDate: null, forgivenUsedThisWeek: false, weekKey: null })
    expect(streak.isLampLit()).toBe(false)
  })

  it('first listen starts the streak at 1', () => {
    const s = streak.markDevotionalListen(d('2026-11-23'))
    expect(s.count).toBe(1)
    expect(s.lastDate).toBe('2026-11-23')
  })

  it('same-day listens count once', () => {
    streak.markDevotionalListen(d('2026-11-23'))
    const s = streak.markDevotionalListen(d('2026-11-23'))
    expect(s.count).toBe(1)
  })

  it('consecutive days grow the streak', () => {
    streak.markDevotionalListen(d('2026-11-23'))
    const s = streak.markDevotionalListen(d('2026-11-24'))
    expect(s.count).toBe(2)
  })

  it('exactly one missed day is forgiven once per week (count survives)', () => {
    streak.markDevotionalListen(d('2026-11-23'))
    streak.markDevotionalListen(d('2026-11-24'))
    const s = streak.markDevotionalListen(d('2026-11-26')) // gap of 2 days
    expect(s.count).toBe(2)
    expect(s.forgivenUsedThisWeek).toBe(true)
  })

  it('a second missed day in the same week restarts the streak at 1', () => {
    streak.markDevotionalListen(d('2026-11-23'))
    streak.markDevotionalListen(d('2026-11-24'))
    streak.markDevotionalListen(d('2026-11-26')) // forgiven gap
    const s = streak.markDevotionalListen(d('2026-11-28')) // gap of 2 again
    expect(s.count).toBe(1)
    expect(s.forgivenUsedThisWeek).toBe(false)
  })

  it('a long gap restarts the streak at 1', () => {
    streak.markDevotionalListen(d('2026-11-23'))
    const s = streak.markDevotionalListen(d('2026-11-28')) // gap of 5 days
    expect(s.count).toBe(1)
  })

  it('7 consecutive days lights the lamp', () => {
    for (let day = 23; day <= 29; day += 1) {
      streak.markDevotionalListen(d(`2026-11-${day}`))
    }
    expect(streak.getStreak().count).toBe(7)
    expect(streak.isLampLit()).toBe(true)
  })

  it('6 days does not light the lamp', () => {
    for (let day = 23; day <= 28; day += 1) {
      streak.markDevotionalListen(d(`2026-11-${day}`))
    }
    expect(streak.isLampLit()).toBe(false)
  })

  it('clock moved back keeps the count', () => {
    streak.markDevotionalListen(d('2026-11-25'))
    const s = streak.markDevotionalListen(d('2026-11-24'))
    expect(s.count).toBe(1)
  })
})

describe('aarti alarm', () => {
  it('defaults to 06:00 with no track', () => {
    expect(streak.loadAlarm()).toEqual({ time: '06:00', trackId: null })
    expect(streak.DEFAULT_ALARM_TIME).toBe('06:00')
  })

  it('saveAlarm round-trips', () => {
    streak.saveAlarm({ time: '05:30', trackId: 'track-1' })
    expect(streak.loadAlarm()).toEqual({ time: '05:30', trackId: 'track-1' })
  })

  it('shouldFireAarti is false before the alarm time', () => {
    const early = new Date('2026-11-23T05:00:00')
    expect(streak.shouldFireAarti({ time: '06:00', trackId: null }, early)).toBe(false)
    const justBefore = new Date('2026-11-23T05:59:00')
    expect(streak.shouldFireAarti({ time: '06:00', trackId: null }, justBefore)).toBe(false)
  })

  it('shouldFireAarti is true at/after the time, then false once fired', () => {
    const at = new Date('2026-11-23T06:00:00')
    expect(streak.shouldFireAarti({ time: '06:00', trackId: null }, at)).toBe(true)
    streak.markAartiFired(at)
    expect(streak.shouldFireAarti({ time: '06:00', trackId: null }, at)).toBe(false)
    // Firing resets the next day
    const nextDay = new Date('2026-11-24T06:00:00')
    expect(streak.shouldFireAarti({ time: '06:00', trackId: null }, nextDay)).toBe(true)
  })

  it('shouldFireAarti is false without an alarm', () => {
    expect(streak.shouldFireAarti(null, d('2026-11-23'))).toBe(false)
  })

  // H12: alarm-time validation — an empty/invalid time used to save
  // and fire as a midnight (00:00) alarm.
  it('isValidAlarmTime accepts real 24-hour times only', () => {
    expect(streak.isValidAlarmTime('06:00')).toBe(true)
    expect(streak.isValidAlarmTime('00:00')).toBe(true)
    expect(streak.isValidAlarmTime('23:59')).toBe(true)
    expect(streak.isValidAlarmTime('')).toBe(false)
    expect(streak.isValidAlarmTime('24:00')).toBe(false)
    expect(streak.isValidAlarmTime('6:00')).toBe(false)
    expect(streak.isValidAlarmTime('06:60')).toBe(false)
    expect(streak.isValidAlarmTime(null)).toBe(false)
    expect(streak.isValidAlarmTime(undefined)).toBe(false)
  })

  it('saveAlarm refuses an empty time and keeps the old alarm', () => {
    streak.saveAlarm({ time: '06:00', trackId: null })
    expect(streak.saveAlarm({ time: '', trackId: null })).toBe(false)
    expect(streak.loadAlarm()).toEqual({ time: '06:00', trackId: null })
  })

  it('saveAlarm refuses an invalid time', () => {
    expect(streak.saveAlarm({ time: '25:00', trackId: null })).toBe(false)
    expect(streak.loadAlarm()).toEqual({ time: '06:00', trackId: null })
  })

  it('saveAlarm returns true for a valid time', () => {
    expect(streak.saveAlarm({ time: '05:30', trackId: 'track-1' })).toBe(true)
    expect(streak.loadAlarm()).toEqual({ time: '05:30', trackId: 'track-1' })
  })
})
