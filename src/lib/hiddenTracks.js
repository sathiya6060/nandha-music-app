// Hidden tracks (Spotify F-019 "Hide" / "Exclude from Taste
// Profile", behaviour only). A hidden track stays playable and
// searchable, but is excluded from every mix, the Daily Mix, the
// daypart shelves and the Discover feed. Stored in localStorage
// (per-device, like likes) so no account or server write is needed.

const HIDDEN_KEY = 'nandha-hidden-tracks'

export function getHiddenIds() {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

export function isHidden(trackId) {
  return getHiddenIds().has(trackId)
}

export function hideTrack(trackId) {
  const hidden = getHiddenIds()
  hidden.add(trackId)
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]))
  } catch {
    /* storage unavailable — hidden state stays in memory only */
  }
  window.dispatchEvent(new CustomEvent('nandha-hidden-changed', { detail: { trackId, hidden: true } }))
  return true
}

export function unhideTrack(trackId) {
  const hidden = getHiddenIds()
  hidden.delete(trackId)
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('nandha-hidden-changed', { detail: { trackId, hidden: false } }))
  return false
}
