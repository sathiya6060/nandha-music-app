// Guest preview gate (S10 smoke test).
//
// Rule (user, 26 Nov 2026): without sign-in only the first 5 seconds
// of a song play. The enforcement point is the <audio> timeupdate
// handler in PlayerContext, which calls guestPreviewEnded() — the pure
// predicate tested here. Live behaviour (audio actually pausing at
// ~5s + the sign-in prompt) is verified headless against vite preview.
import { describe, it, expect } from 'vitest'
import {
  PREVIEW_SECONDS,
  guestPreviewEnded,
} from '../../player/PlayerContext.jsx'
import {
  clampGuestSeek,
  clampGuestHookStart,
  clampGuestResume,
} from '../guestGate.js'

describe('guest preview gate', () => {
  it('the preview limit is 5 seconds', () => {
    expect(PREVIEW_SECONDS).toBe(5)
  })

  it('pauses a guest at exactly 5s and beyond', () => {
    expect(guestPreviewEnded(5, true)).toBe(true)
    expect(guestPreviewEnded(5.3, true)).toBe(true)
    expect(guestPreviewEnded(300, true)).toBe(true)
  })

  it('does not pause a guest inside the preview window', () => {
    expect(guestPreviewEnded(0, true)).toBe(false)
    expect(guestPreviewEnded(4.99, true)).toBe(false)
  })

  it('never pauses a signed-in listener', () => {
    expect(guestPreviewEnded(5, false)).toBe(false)
    expect(guestPreviewEnded(300, false)).toBe(false)
  })
})

// M23: enforcement clamps, not just the predicate — seek, hook start
// and resume all go through these pure helpers (lib/guestGate.js;
// PlayerContext seekTo, play, setQuality and the signed-URL retry
// handler use them).
describe('guest-gate enforcement clamps', () => {
  it('seek past 5s clamps to 5s and ends the preview for a guest', () => {
    expect(clampGuestSeek(30, 224, true)).toEqual({ time: 5, previewEnded: true })
    expect(clampGuestSeek(5, 224, true)).toEqual({ time: 5, previewEnded: true })
    expect(clampGuestSeek(300, 224, true)).toEqual({ time: 5, previewEnded: true })
  })

  it('seek inside the preview window does not end it', () => {
    expect(clampGuestSeek(0, 224, true)).toEqual({ time: 0, previewEnded: false })
    expect(clampGuestSeek(4.99, 224, true)).toEqual({ time: 4.99, previewEnded: false })
  })

  it('seek never ends the preview for a signed-in listener', () => {
    expect(clampGuestSeek(30, 224, false)).toEqual({ time: 30, previewEnded: false })
    expect(clampGuestSeek(300, 224, false)).toEqual({ time: 224, previewEnded: false })
  })

  it('seek clamps to the track duration', () => {
    expect(clampGuestSeek(999, 224, false)).toEqual({ time: 224, previewEnded: false })
    expect(clampGuestSeek(-10, 224, true)).toEqual({ time: 0, previewEnded: false })
  })

  it('a hook at/past 5s is forced to 0 for a guest, kept for signed-in', () => {
    expect(clampGuestHookStart(12, true)).toBe(0)
    expect(clampGuestHookStart(5, true)).toBe(0)
    expect(clampGuestHookStart(12, false)).toBe(12)
    expect(clampGuestHookStart(0, true)).toBe(0)
    expect(clampGuestHookStart(4.5, true)).toBe(4.5)
  })

  it('resume never restarts past 5s for a guest, is untouched for signed-in', () => {
    expect(clampGuestResume(120, true)).toBe(5)
    expect(clampGuestResume(3, true)).toBe(3)
    expect(clampGuestResume(120, false)).toBe(120)
  })

  it('timeupdate gate + seek clamp agree at the boundary', () => {
    // The timeupdate handler pauses when guestPreviewEnded fires; a
    // seek to the same time must produce the same ended state.
    for (const t of [4.99, 5, 5.01, 30]) {
      expect(guestPreviewEnded(t, true)).toBe(clampGuestSeek(t, 224, true).previewEnded)
    }
  })
})
