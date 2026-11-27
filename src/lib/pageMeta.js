// Nandha Music — per-route document title + social meta (S7).
//
// Until Phase 4 every route shared the single title/OG set from
// index.html, og:url was missing, and og:image was a relative path
// (social scrapers need absolute URLs). There was no title/meta
// handling in the app at all, so this module is the one place that
// touches document.title / meta tags.
//
// Usage: a detail page calls setPageMeta(...) in a useEffect once its
// entity resolves, and returns resetPageMeta from the effect cleanup
// so navigating away restores the site defaults. Pages without their
// own meta need no code — the previous page's cleanup resets it.
export const SITE_URL = 'https://nandhamusic.pages.dev'
const DEFAULT_TITLE = 'Nandha Music — YOUR BEAT. YOUR ECHO.'
const DEFAULT_DESCRIPTION =
  'Official Tamil Music Label | Love • Devotional • Melody | Stream Vaazhvinil Orumurayenum now.'
export const DEFAULT_IMAGE = `${SITE_URL}/assets/nandha-og.jpg`

// The admin-chosen link preview image (Admin → Site Settings →
// "Link preview image", stored in localStorage under the same key
// adminStore.js uses: 'nandha-site-settings'). Read directly from
// localStorage here instead of importing adminStore — that module pulls
// in the Supabase client, which this tiny meta helper must not drag in.
// Falls back to the brand OG card when nothing is saved (or when there
// is no localStorage, e.g. tests / SSR).
export function getDefaultImage() {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_IMAGE
    const raw = localStorage.getItem('nandha-site-settings')
    const saved = raw ? JSON.parse(raw)?.previewImage : null
    if (typeof saved === 'string' && saved.trim()) return absoluteUrl(saved.trim())
  } catch {
    // Corrupt JSON / blocked storage — fall through to the default.
  }
  return DEFAULT_IMAGE
}

// Known sizes for the images the preview setting can pick, so the
// og:image:width/height hints stay truthful. Anything else drops the
// hints instead of stating a wrong size.
function defaultImageSize(img) {
  if (img.endsWith('/assets/nandha-og.jpg')) return ['1200', '630']
  if (img.endsWith('/assets/vaazhvinil-cover.jpg')) return ['3000', '3000']
  if (img.endsWith('-cover-800.jpg')) return ['800', '800']
  return null
}

/** Turn a catalog cover path (relative or absolute) into an absolute URL. */
export function absoluteUrl(path) {
  if (!path) return getDefaultImage()
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

function setMeta(selector, content) {
  if (typeof document === 'undefined' || content == null) return
  let el = document.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    const attr = selector.includes('property=') ? 'property' : 'name'
    const value = selector.match(/["']([^"']+)["']/)?.[1]
    if (!value) return
    el.setAttribute(attr, value)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function removeMeta(selector) {
  if (typeof document === 'undefined') return
  document.querySelector(selector)?.remove()
}

/**
 * Set the page title + description + Open Graph / Twitter tags.
 * Any field left out falls back to the site default.
 */
export function setPageMeta({ title, description, image, url, type } = {}) {
  if (typeof document === 'undefined') return
  const fullTitle = title ? `${title} | Nandha Music` : DEFAULT_TITLE
  const desc = description || DEFAULT_DESCRIPTION
  const img = absoluteUrl(image)
  const pageUrl = url ? absoluteUrl(url) : SITE_URL
  document.title = fullTitle
  setMeta('meta[name="description"]', desc)
  setMeta('meta[property="og:title"]', fullTitle)
  setMeta('meta[property="og:description"]', desc)
  setMeta('meta[property="og:type"]', type || 'website')
  setMeta('meta[property="og:url"]', pageUrl)
  setMeta('meta[property="og:image"]', img)
  // Width/height hints: a detail page's cover has an unknown size (DB
  // cover or the 800px variant), so drop the hints instead of stating a
  // wrong size. The site default comes from the preview-image setting,
  // whose known sizes live in defaultImageSize().
  if (image) {
    removeMeta('meta[property="og:image:width"]')
    removeMeta('meta[property="og:image:height"]')
  } else {
    const size = defaultImageSize(img)
    if (size) {
      setMeta('meta[property="og:image:width"]', size[0])
      setMeta('meta[property="og:image:height"]', size[1])
    } else {
      removeMeta('meta[property="og:image:width"]')
      removeMeta('meta[property="og:image:height"]')
    }
  }
  setMeta('meta[name="twitter:card"]', 'summary_large_image')
  setMeta('meta[name="twitter:title"]', fullTitle)
  setMeta('meta[name="twitter:description"]', desc)
  setMeta('meta[name="twitter:image"]', img)
}

/** Restore the site-default title + meta (index.html values). */
export function resetPageMeta() {
  setPageMeta({})
}
