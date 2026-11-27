// Item 7 — export + clear of device-local data (localData.js).
// Node env has no localStorage/document/URL, so all three are stubbed.
import { describe, expect, it, vi } from 'vitest'
import { clearLocalData, exportLocalData } from '../localData.js'

function stubStorage() {
  const store = new Map()
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    get length() { return store.size },
    key: (i) => [...store.keys()][i] ?? null,
  }
  vi.stubGlobal('localStorage', storage)
  return store
}

describe('clearLocalData', () => {
  it('removes every nandha- key and leaves everything else alone', () => {
    const store = stubStorage()
    store.set('nandha-liked', '["a"]')
    store.set('nandha-lang-v2', 'ta')
    store.set('nandha-consent', 'accepted')
    store.set('sb-ref-auth-token', 'session-must-stay')
    store.set('other-key', 'keep')
    clearLocalData()
    expect(store.has('nandha-liked')).toBe(false)
    expect(store.has('nandha-lang-v2')).toBe(false)
    expect(store.has('nandha-consent')).toBe(false)
    // The Supabase session is NOT local app data — it must survive.
    expect(store.get('sb-ref-auth-token')).toBe('session-must-stay')
    expect(store.get('other-key')).toBe('keep')
  })
})

describe('exportLocalData', () => {
  it('downloads a JSON blob with the known keys', () => {
    const store = stubStorage()
    store.set('nandha-liked', '["vaazhvinil-orumurayenum"]')
    store.set('nandha-lang-v2', 'ta')
    let blobText = ''
    let downloadedName = ''
    const anchor = {
      click: vi.fn(),
      remove: vi.fn(),
      set href(v) { this._href = v },
      get href() { return this._href },
    }
    vi.stubGlobal('Blob', class Blob {
      constructor(parts) { blobText = parts.join('') }
    })
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:nandha',
      revokeObjectURL: vi.fn(),
    })
    vi.stubGlobal('document', {
      createElement: () => anchor,
      body: { appendChild: vi.fn() },
    })
    exportLocalData()
    const data = JSON.parse(blobText)
    expect(data.app).toBe('Nandha Music')
    expect(data.liked).toEqual(['vaazhvinil-orumurayenum'])
    expect(data.language).toBe('ta')
    expect(data.playlists).toBeNull()
    expect(anchor.click).toHaveBeenCalled()
    expect(anchor.download).toBe('nandha-music-data.json')
    downloadedName = anchor.download
    expect(downloadedName).toBe('nandha-music-data.json')
  })
})
