// TrackRow liked-set helpers (pure localStorage logic, no DOM):
// toggleLiked round-trips.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../player/PlayerContext.jsx', () => ({ usePlayer: () => null }))
vi.mock('../lib/toast.jsx', () => ({ useToast: () => null }))
vi.mock('../lib/userLibrary.js', () => ({ syncLike: async () => ({ ok: false }) }))

import { getLikedIds, toggleLiked } from '../TrackRow.jsx'

function stubStorage() {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
  vi.stubGlobal('window', { dispatchEvent: () => {} })
  return store
}

describe('liked ids', () => {
  beforeEach(() => {
    stubStorage()
  })

  it('toggleLiked adds then removes', () => {
    expect(toggleLiked('song-a')).toBe(true)
    expect(getLikedIds().has('song-a')).toBe(true)
    expect(toggleLiked('song-a')).toBe(false)
    expect(getLikedIds().has('song-a')).toBe(false)
  })
})
