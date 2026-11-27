// Recent searches (Spotify F-028, behaviour only). Per-device
// localStorage, most recent first, max 8, de-duplicated. A search is
// saved only once its results have settled (the caller decides when).
const KEY = 'nandha-recent-searches'
const MAX_RECENT = 8

export function getRecentSearches() {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((q) => typeof q === 'string' && q.trim() !== '') : []
  } catch {
    return []
  }
}

export function addRecentSearch(query) {
  const q = String(query || '').trim()
  if (!q) return getRecentSearches()
  const next = [q, ...getRecentSearches().filter((item) => item.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('nandha-recent-searches-changed'))
  return next
}

export function removeRecentSearch(query) {
  const next = getRecentSearches().filter((item) => item !== query)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('nandha-recent-searches-changed'))
  return next
}

export function clearRecentSearches() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('nandha-recent-searches-changed'))
  return []
}
