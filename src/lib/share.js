/**
 * Share a link (item 9, 27 Nov 2026): Web Share API with a
 * clipboard fallback. Returns 'shared' | 'copied' | 'cancelled' |
 * 'failed' so callers can toast the right thing. 'cancelled' (the
 * user closed the share sheet) is not an error — callers show nothing.
 */
export async function shareLink({ title, text, url }) {
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title, text, url })
      return 'shared'
    }
    throw new Error('no-share')
  } catch (err) {
    if (err && err.name === 'AbortError') return 'cancelled'
    try {
      await navigator.clipboard.writeText(url)
      return 'copied'
    } catch {
      return 'failed'
    }
  }
}
