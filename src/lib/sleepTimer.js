// Sleep timer (Spotify F-023, behaviour only). Pure helpers — the
// countdown itself lives in PlayerContext (a single setTimeout that
// stops playback when it fires). The timer is per-session: it does not
// survive a reload, exactly like a bedtime timer should not.
export const SLEEP_OPTIONS_MINUTES = [5, 10, 15, 30, 60]

// Item 7 (27 Nov 2026): the sleep-timer DEFAULT from /settings.
// 'off' | 'end' | one of SLEEP_OPTIONS_MINUTES. The default only
// highlights that option in the sleep sheet when no timer is running
// — it never starts a timer on its own, and the timer itself stays
// per-session.
export const SLEEP_DEFAULT_KEY = 'nandha-sleep-default'

export function loadSleepDefault() {
  try {
    const raw = localStorage.getItem(SLEEP_DEFAULT_KEY)
    if (raw === 'end') return 'end'
    const n = Number(raw)
    if (SLEEP_OPTIONS_MINUTES.includes(n)) return n
  } catch {
    // ignore — fall through to 'off'
  }
  return 'off'
}

export function saveSleepDefault(value) {
  try {
    localStorage.setItem(SLEEP_DEFAULT_KEY, String(value))
  } catch {
    // ignore — the in-memory state still applies for this session
  }
}

/** Absolute end time for a timer started now. */
export function sleepEndsAt(minutes, now = Date.now()) {
  return now + Number(minutes) * 60000
}

/** Milliseconds left; never negative. */
export function sleepRemainingMs(endsAt, now = Date.now()) {
  return Math.max(0, Number(endsAt) - now)
}

/** "12:34" remaining — minutes:seconds, rounded up so the last
 *  minute still reads 1:00 instead of 0:00 while time is left. */
export function formatSleepRemaining(ms) {
  const totalSec = Math.ceil(Math.max(0, ms) / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
