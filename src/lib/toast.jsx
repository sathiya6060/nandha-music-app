import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { nextToastId } from './toastId.js'
import { resolveToastOptions } from './toastOptions.js'

/**
 * Toast system (item 9, 27 Nov 2026): one small, transient status
 * message for library/account actions — like, follow, playlist
 * create, alarm save, share-copy. A single toast replaces the last;
 * it auto-dismisses after 3.5s. Playback feedback keeps using the
 * player notice (PlayerContext.setNotice) — the two channels have
 * different owners, so a toast never fights a playback message.
 *
 * Prod sweep (27 Nov 2026): the toast region sits just above the
 * bottom chrome (player bar + nav), which is exactly where the
 * cookie consent banner lives on a first visit — a toast fired
 * while the banner was up (e.g. liking a song) overlapped the
 * banner's text. When the banner is present the region is lifted
 * above it, measured from the banner's actual top edge, so the
 * Accept/Decline buttons are never covered.
 *
 * Usage: const showToast = useToast(); showToast(t('toast.followed'))
 * The provider must wrap the app (App.jsx) so every page can toast.
 */
const ToastContext = createContext(null)

// L12: useToast() outside the provider used to return null, so a
// caller doing showToast(msg) threw. The provider does wrap the app
// (App.jsx), but a toast call from outside it must be a silent no-op,
// never a crash.
const noopToast = () => {}

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)
  const regionRef = useRef(null)

  // Lift the toast above the consent banner while it is visible.
  useEffect(() => {
    const region = regionRef.current
    if (!toast || !region) return
    const banner = document.querySelector('.consent-banner')
    if (!banner) {
      region.style.bottom = ''
      return
    }
    const top = banner.getBoundingClientRect().top
    region.style.bottom = `${Math.max(0, window.innerHeight - top + 12)}px`
  }, [toast])

  const dismissToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setToast(null)
  }, [])

  // Backwards compatible: showToast(message) behaves exactly as
  // before (3.5s, no action, single toast replaces the last).
  // showToast(message, { actionLabel, onAction, durationMs }) adds
  // an action button (Undo use-case passes durationMs: 8000).
  const showToast = useCallback((message, options) => {
    if (!message) return
    if (timerRef.current) clearTimeout(timerRef.current)
    const resolved = resolveToastOptions(options)
    setToast({ id: nextToastId(), message, ...resolved })
    timerRef.current = setTimeout(() => setToast(null), resolved.durationMs)
  }, [])

  const handleAction = () => {
    const action = toast?.onAction
    try {
      action?.()
    } finally {
      // The action runs first, then the toast dismisses — even if
      // the action throws, the toast must not stick around.
      dismissToast()
    }
  }

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <div className="toast-region" role="status" aria-live="polite" ref={regionRef}>
          <div className={`toast${toast.actionLabel ? ' toast--with-action' : ''}`} key={toast.id}>
            <span className="toast__message">{toast.message}</span>
            {toast.actionLabel && (
              <button type="button" className="toast__action" onClick={handleAction}>
                {toast.actionLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components --
// same pattern as PlayerContext/auth (provider + its hook in one
// file); Fast Refresh is not used for this app shell.
export function useToast() {
  return useContext(ToastContext) ?? noopToast
}
