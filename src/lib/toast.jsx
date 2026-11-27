import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

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

  const showToast = useCallback((message) => {
    if (!message) return
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast({ id: Date.now(), message })
    timerRef.current = setTimeout(() => setToast(null), 3500)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <div className="toast-region" role="status" aria-live="polite" ref={regionRef}>
          <div className="toast" key={toast.id}>{toast.message}</div>
        </div>
      )}
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components --
// same pattern as PlayerContext/auth (provider + its hook in one
// file); Fast Refresh is not used for this app shell.
export function useToast() {
  return useContext(ToastContext)
}
