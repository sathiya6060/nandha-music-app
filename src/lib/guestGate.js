// Guest preview gate — pure enforcement clamps (M23).
//
// The 5s limit itself lives in PlayerContext (PREVIEW_SECONDS /
// guestPreviewEnded, kept there so the phase-3 smoke check that greps
// PlayerContext still holds). This module mirrors that constant —
// keep the two in sync; guestGate.test.js asserts both are 5 via the
// boundary behaviour (a seek to exactly 5 ends the preview).
const PREVIEW_SECONDS = 5

/** Seek clamp: past 5s a guest lands at 5s with the preview ended. */
export function clampGuestSeek(seconds, duration, isGuest) {
  const dur = Number.isFinite(duration) ? duration : 0
  const clamped = Math.min(Math.max(0, seconds), dur || 0)
  if (isGuest && clamped >= PREVIEW_SECONDS) {
    return { time: PREVIEW_SECONDS, previewEnded: true }
  }
  return { time: clamped, previewEnded: false }
}

/** A hook at/past the 5s limit starts at 0 for a guest. */
export function clampGuestHookStart(hookAt, isGuest) {
  return isGuest && hookAt >= PREVIEW_SECONDS ? 0 : hookAt
}

/** A resume never restarts past 5s for a guest. */
export function clampGuestResume(time, isGuest) {
  return isGuest ? Math.min(time || 0, PREVIEW_SECONDS) : time || 0
}
