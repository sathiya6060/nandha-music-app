// H16: the 7-day pinned-audio TTL was enforced when listing pins but
// never on READ — an expired pin kept playing forever. getPinnedAudioBlobUrl
// must return null for expired pins and delete the stale cache entry;
// isTrackPinned must stop counting expired pins.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const DAY = 24 * 60 * 60 * 1000
const track = { id: 'vaazhvinil-orumurayenum', titleEn: 'Vaazhvinil Orumurayenum' }

let metaStore
let cacheEntries
let deletedKeys

function stubStorage() {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
  return store
}

beforeEach(async () => {
  vi.resetModules()
  const store = stubStorage()
  metaStore = store
  cacheEntries = new Set()
  deletedKeys = []
  // pwa.js checks `'caches' in window`, so the stub must live on
  // window (as in a real browser) as well as on the global.
  const cachesStub = {
    open: async () => ({
      match: async (key) => (cacheEntries.has(key) ? { blob: async () => new Blob(['audio']) } : null),
      delete: async (key) => {
        deletedKeys.push(key)
        return cacheEntries.delete(key)
      },
      keys: async () => [...cacheEntries].map((url) => ({ url })),
    }),
    delete: async () => true,
  }
  vi.stubGlobal('caches', cachesStub)
  vi.stubGlobal('window', { dispatchEvent: () => {}, addEventListener: () => {}, caches: cachesStub })
  vi.stubGlobal('location', { origin: 'http://localhost:5173' })
})

async function loadPwa() {
  return import('../pwa.js')
}

describe('pinned-audio TTL on read (H16)', () => {
  it('returns a blob URL for a fresh pin', async () => {
    const pwa = await loadPwa()
    metaStore.set('nandha-pinned-meta', JSON.stringify([
      { url: pwa.pinnedAudioKey(track), trackId: track.id, title: track.titleEn, pinnedAt: Date.now() },
    ]))
    cacheEntries.add(pwa.pinnedAudioKey(track))
    const url = await pwa.getPinnedAudioBlobUrl(track)
    expect(typeof url).toBe('string')
    expect(url.startsWith('blob:')).toBe(true)
  })

  it('returns null for an expired pin and deletes the cache entry', async () => {
    const pwa = await loadPwa()
    const key = pwa.pinnedAudioKey(track)
    metaStore.set('nandha-pinned-meta', JSON.stringify([
      { url: key, trackId: track.id, title: track.titleEn, pinnedAt: Date.now() - 8 * DAY },
    ]))
    cacheEntries.add(key)
    const url = await pwa.getPinnedAudioBlobUrl(track)
    expect(url).toBeNull()
    expect(deletedKeys).toContain(key)
    expect(cacheEntries.has(key)).toBe(false)
    const meta = JSON.parse(metaStore.get('nandha-pinned-meta'))
    expect(meta).toEqual([])
  })

  it('a pin exactly 7 days old is expired', async () => {
    const pwa = await loadPwa()
    metaStore.set('nandha-pinned-meta', JSON.stringify([
      { url: pwa.pinnedAudioKey(track), trackId: track.id, title: track.titleEn, pinnedAt: Date.now() - 7 * DAY },
    ]))
    cacheEntries.add(pwa.pinnedAudioKey(track))
    expect(await pwa.getPinnedAudioBlobUrl(track)).toBeNull()
  })

  it('returns null when there is no pin at all', async () => {
    const pwa = await loadPwa()
    expect(await pwa.getPinnedAudioBlobUrl(track)).toBeNull()
  })

  it('isTrackPinned is false for an expired pin, true for a fresh one', async () => {
    const pwa = await loadPwa()
    metaStore.set('nandha-pinned-meta', JSON.stringify([
      { url: pwa.pinnedAudioKey(track), trackId: track.id, title: track.titleEn, pinnedAt: Date.now() - 8 * DAY },
    ]))
    cacheEntries.add(pwa.pinnedAudioKey(track))
    expect(await pwa.isTrackPinned(track)).toBe(false)

    metaStore.set('nandha-pinned-meta', JSON.stringify([
      { url: pwa.pinnedAudioKey(track), trackId: track.id, title: track.titleEn, pinnedAt: Date.now() },
    ]))
    expect(await pwa.isTrackPinned(track)).toBe(true)
  })
})
