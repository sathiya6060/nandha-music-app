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
