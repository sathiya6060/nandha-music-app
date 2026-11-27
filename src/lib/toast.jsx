import { createContext, useCallback, useContext, useRef, useState } from 'react'

/**
 * Toast system (item 9, 27 Nov 2026): one small, transient status
 * message for library/account actions — like, follow, playlist
 * create, alarm save, share-copy. A single toast replaces the last;
 * it auto-dismisses after 3.5s. Playback feedback keeps using the
 * player notice (PlayerContext.setNotice) — the two channels have
 * different owners, so a toast never fights a playback message.
 *
 * Usage: const showToast = useToast(); showToast(t('toast.followed'))
 * The provider must wrap the app (App.jsx) so every page can toast.
 */
const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

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
        <div className="toast-region" role="status" aria-live="polite">
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
