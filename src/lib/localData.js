// Local data helpers (item 7, 27 Nov 2026): export + clear of the
// app's device-local data. Used by /settings (Privacy) and /profile
// (after an account deletion, so no local trace is left behind).
// Every app-local key starts with 'nandha-'. The Supabase session
// ('sb-…-auth-token') is deliberately NOT touched — clearing local
// data must not sign the user out (deleting the ACCOUNT signs out;
// clearing local data does not).
const EXPORT_KEYS = [
  ['liked', 'nandha-liked'],
  ['followedArtists', 'nandha-followed-artists'],
  ['playlists', 'nandha-user-playlists'],
  ['streak', 'nandha-streak'],
  ['alarm', 'nandha-aarti-alarm'],
  ['language', 'nandha-lang-v2'],
  ['quality', 'nandha-player-quality'],
  ['autoplay', 'nandha-player-radio'],
  ['sleepDefault', 'nandha-sleep-default'],
  ['recentSearches', 'nandha-recent-searches'],
  ['pinnedTracks', 'nandha-pinned-meta'],
  ['hiddenTracks', 'nandha-hidden-tracks'],
]

function readExportValue(key) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return null
    try { return JSON.parse(raw) } catch { return raw }
  } catch {
    return null
  }
}

/** Downloads a JSON file with the user's device-local data. */
export function exportLocalData() {
  const data = { exportedAt: new Date().toISOString(), app: 'Nandha Music' }
  for (const [name, key] of EXPORT_KEYS) data[name] = readExportValue(key)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'nandha-music-data.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Removes every 'nandha-' localStorage key. Does NOT reload — the
 *  caller decides (Settings reloads so every screen re-reads
 *  defaults; Profile reloads via navigation after sign-out). */
export function clearLocalData() {
  const doomed = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key && key.startsWith('nandha-')) doomed.push(key)
  }
  doomed.forEach((key) => { try { localStorage.removeItem(key) } catch { /* ignore */ } })
}
