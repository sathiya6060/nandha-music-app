// Nandha Music — lightweight error observability (S11, 27 Nov 2026).
//
// No error-reporting service, no RUM, nothing leaves the device: errors
// were invisible until a user reported them (the redis-cache CORS errors
// were found only by manual console checks), so this module keeps the
// last 50 errors in a small in-memory ring buffer and exposes it on
// `window.nandhaErrors` for debugging (open DevTools and read it, or
// call `window.nandhaErrors` after a bug report).
//
// The single logging point is ErrorBoundary.componentDidCatch, which
// calls recordError() here (plus its existing console.error). Global
// window.onerror / unhandledrejection hooks are installed once from
// main.jsx via installErrorHooks(). Nothing here phones home.
const MAX_ENTRIES = 50

const buffer = []

function describe(error) {
  if (error instanceof Error) return { message: error.message, stack: error.stack }
  if (typeof error === 'string') return { message: error }
  try {
    return { message: String(error) }
  } catch {
    return { message: '[unprintable error]' }
  }
}

/** Record one error. Returns the stored entry. */
export function recordError(source, error, extra = {}) {
  const entry = {
    at: new Date().toISOString(),
    source,
    ...describe(error),
    ...extra,
  }
  buffer.push(entry)
  while (buffer.length > MAX_ENTRIES) buffer.shift()
  if (typeof window !== 'undefined') {
    // Live reference: DevTools sees new entries without re-reading.
    window.nandhaErrors = buffer
  }
  return entry
}

/** Copy of the buffered errors (oldest first, max 50). */
export function getErrors() {
  return [...buffer]
}

/** Clear the buffer (tests + manual debugging). */
export function clearErrors() {
  buffer.length = 0
}

/** Install the global window.onerror / unhandledrejection hooks once.
 *  Safe to call repeatedly; no-ops outside a browser. */
export function installErrorHooks() {
  if (typeof window === 'undefined' || window.__nandhaErrorHooksInstalled) return
  window.__nandhaErrorHooksInstalled = true
  window.addEventListener('error', (event) => {
    recordError('window.onerror', event.error || event.message, {
      filename: event.filename || undefined,
      lineno: event.lineno || undefined,
    })
  })
  window.addEventListener('unhandledrejection', (event) => {
    recordError('unhandledrejection', event.reason)
  })
}
