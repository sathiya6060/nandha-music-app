/**
 * Daily Bhakti Streak + Morning Aarti Alarm (v1, local only).
 *
 * Streak rules (deterministic, localStorage-backed):
 * - Listening to 1 devotional song/day (30s played) grows the streak.
 * - Same-day listens count once.
 * - A gap of exactly one missed day is forgiven once per week; a longer
 *   gap (or a second miss in the same week) restarts the streak at 1.
 * - 7 days = lamp lit badge.
 *
 * Alarm (v1 honest limit): there is no push server, so a true background
 * alarm is P2. The v1 alarm fires when the app/tab is open at the alarm
 * time (checked on an interval from Home): it shows a Notification (when
 * permission is granted) and plays the chosen song. The hero card always
 * shows today's aarti time.
 */

export const STREAK_KEY = 'nandha-streak'
export const ALARM_KEY = 'nandha-aarti-alarm'
export const AARTI_FIRED_KEY = 'nandha-aarti-fired'

export const DEFAULT_ALARM_TIME = '06:00'
export const LAMP_DAYS = 7

function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function weekKey(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - day)
  return dayKey(d)
}

function daysBetween(aKey, bKey) {
  const a = new Date(`${aKey}T00:00:00`)
  const b = new Date(`${bKey}T00:00:00`)
  return Math.round((b - a) / 86400000)
}

export function loadStreak() {
  try {
    const raw = localStorage.getItem(STREAK_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed.count === 'number') {
      return {
        count: Math.max(0, parsed.count),
        lastDate: parsed.lastDate || null,
        forgivenUsedThisWeek: !!parsed.forgivenUsedThisWeek,
        weekKey: parsed.weekKey || null,
      }
    }
  } catch {
    // storage unavailable — fall through to a fresh streak
  }
  return { count: 0, lastDate: null, forgivenUsedThisWeek: false, weekKey: null }
}

export function saveStreak(streak) {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(streak))
  } catch {
    // storage unavailable
  }
  window.dispatchEvent(new CustomEvent('nandha-streak-changed', { detail: streak }))
}

export function getStreak() {
  return loadStreak()
}

export function isLampLit(streak = loadStreak()) {
  return (streak?.count || 0) >= LAMP_DAYS
}

/**
 * Record one qualifying devotional listen for today. Returns the updated
 * streak. Safe to call repeatedly — same-day listens count once.
 */
export function markDevotionalListen(date = new Date()) {
  const today = dayKey(date)
  const week = weekKey(date)
  const streak = loadStreak()

  // New week — the weekly forgiveness resets.
  if (streak.weekKey !== week) {
    streak.forgivenUsedThisWeek = false
    streak.weekKey = week
  }

  if (streak.lastDate === today) return streak // already counted today

  if (!streak.lastDate) {
    streak.count = 1
  } else {
    const gap = daysBetween(streak.lastDate, today)
    if (gap === 1) {
      streak.count += 1 // consecutive day
    } else if (gap === 2 && !streak.forgivenUsedThisWeek) {
      streak.forgivenUsedThisWeek = true // one missed day forgiven
    } else if (gap > 1) {
      streak.count = 1 // streak restarts (forgiveness already used, or long gap)
      streak.forgivenUsedThisWeek = false
    }
    // gap <= 0 (clock moved back) — keep the count, just stamp today
  }

  streak.lastDate = today
  saveStreak(streak)
  return streak
}

// ---------------------------------------------------------------------------
// Aarti alarm
// ---------------------------------------------------------------------------

export function loadAlarm() {
  try {
    const raw = localStorage.getItem(ALARM_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed.time === 'string') {
      return { time: parsed.time, trackId: parsed.trackId || null }
    }
  } catch {
    // ignore
  }
  return { time: DEFAULT_ALARM_TIME, trackId: null }
}

export function saveAlarm(alarm) {
  try {
    localStorage.setItem(ALARM_KEY, JSON.stringify(alarm))
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent('nandha-alarm-changed', { detail: alarm }))
}

/** "HH:MM" -> minutes since midnight. */
export function alarmMinutes(time) {
  const [h, m] = String(time || DEFAULT_ALARM_TIME).split(':').map(Number)
  return (Number.isFinite(h) ? h : 6) * 60 + (Number.isFinite(m) ? m : 0)
}

/**
 * True only when the alarm time has been hit today and it has not
 * fired yet today. Callers mark it fired with markAartiFired().
 */
export function shouldFireAarti(alarm, now = new Date()) {
  if (!alarm) return false
  const nowMin = now.getHours() * 60 + now.getMinutes()
  if (nowMin < alarmMinutes(alarm.time)) return false
  try {
    if (localStorage.getItem(AARTI_FIRED_KEY) === dayKey(now)) return false
  } catch {
    return false
  }
  return true
}

export function markAartiFired(now = new Date()) {
  try {
    localStorage.setItem(AARTI_FIRED_KEY, dayKey(now))
  } catch {
    // ignore
  }
}
