// Nandha Music — lightweight error observability (S11, 27 Nov 2026).
//
// No error-reporting service, no RUM, nothing leaves the device: errors
// were invisible until a user reported them (the redis-cache CORS errors
// were found only by manual console checks), so this module keeps the
// last 50 errors in a small in-memory ring buffer.
//
// L11: the buffer itself is NEVER exposed on window. DevTools reads
// `window.nandhaErrors`, but it is a getter that returns a fresh copy
// on every read — a page script can inspect errors, never mutate the
// live buffer (pushing to the copy does nothing). Code uses
// `getErrors()` (also a copy) or `window.nandhaErrorLog.getErrors`
// (main.jsx). The getter carries a no-op setter so the legacy
// `window.nandhaErrors = ...` boot assignment in main.jsx does not
// throw in strict-mode modules.
//
// The single logging point is ErrorBoundary.componentDidCatch, which
// calls recordError() here (plus its existing console.error). Global
// window.onerror / unhandledrejection hooks are installed once from
// main.jsx via installErrorHooks(). Nothing here phones home.
const MAX_ENTRIES = 50

const buffer = []

let snapshotExposed = false

/** Install the read-only `window.nandhaErrors` snapshot getter once.
 *  Safe to call repeatedly and outside a browser (no-op there). */
function exposeErrorsSnapshot() {
  if (typeof window === 'undefined' || snapshotExposed) return
  try {
    Object.defineProperty(window, 'nandhaErrors', {
      configurable: true,
      enumerable: true,
      get() {
        return [...buffer]
      },
      // No-op setter: legacy boot-time assignment must not throw.
      set() {},
    })
    snapshotExposed = true
  } catch {
    /* DevTools exposure is best-effort; recording still works */
  }
}

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
  // L11: caller extras spread FIRST — core fields (at/source/message/
  // stack) are set after them, so a caller can never overwrite them
  // (e.g. a forged `message` or `source` in `extra`).
  const entry = {
    ...extra,
    at: new Date().toISOString(),
    source,
    ...describe(error),
  }
  buffer.push(entry)
  while (buffer.length > MAX_ENTRIES) buffer.shift()
  exposeErrorsSnapshot()
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
  exposeErrorsSnapshot()
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
