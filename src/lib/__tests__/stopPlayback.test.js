// stopPlayback contract (S10 smoke test).
//
// stopPlayback() (mini-player close button) must clear the audio src,
// drop the signed URL, and reset the player to: empty queue, no track,
// paused, closed. The state reset is exactly stoppedPlayerState() —
// tested here. The live half (the <audio> element's src is actually
// cleared and the bar actually disappears) is verified headless
// against vite preview, because it needs a real DOM + audio element.
import { describe, it, expect } from 'vitest'
import { stoppedPlayerState } from '../../player/PlayerContext.jsx'

describe('stopPlayback state contract', () => {
  it('clears the queue, the track, playback and the open player', () => {
    expect(stoppedPlayerState()).toEqual({
      queue: [],
      queueIndex: 0,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      isPlayerOpen: false,
      previewEnded: false,
    })
  })

  it('returns a fresh object every call (no shared mutable state)', () => {
    const a = stoppedPlayerState()
    const b = stoppedPlayerState()
    expect(a).not.toBe(b)
    expect(a.queue).not.toBe(b.queue)
  })
})
