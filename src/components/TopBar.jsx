import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { useAuth } from '../lib/auth.jsx'
import Logo from './Logo.jsx'
import Icon from './Icons.jsx'
import LanguageSwitcher from './LanguageSwitcher.jsx'

/**
 * Top bar: logo, desktop search, language switcher, account.
 *
 * Item 6 (27 Nov 2026): guests see Sign in / Sign up here (listening
 * still works with no account — guests hear a 5-second preview, and
 * /login?mode=signup creates a free listener account). Signed-in users
 * see an avatar menu (Profile, Settings, Admin for the allowlisted
 * admin email, Sign out). /login stays reachable directly too.
 *
 * The search box follows the URL ?q= — the same single source of truth
 * as the in-page search box — so the two never disagree. The sync is
 * skipped while this input is focused, so typing here is never
 * clobbered by the in-page box writing its debounced query to the URL.
 */
export default function TopBar() {
  const { t } = useI18n()
  const { user, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (focused) return
    setQuery(searchParams.get('q') || searchParams.get('genre') || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, focused])

  // Close the account menu on Back/forward (the menu Links already
  // close it for taps; programmatic navigations from inside the menu
  // close it first). A popstate listener — not a pathname effect —
  // so no set-state-in-effect warning.
  useEffect(() => {
    const onPopState = () => setMenuOpen(false)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Close the account menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return undefined
    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  function handleSearchSubmit(e) {
    e.preventDefault()
    const q = query.trim()
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`)
    else navigate('/search')
  }

  async function handleSignOut() {
    setMenuOpen(false)
    try {
      await signOut()
    } catch {
      // Sign-out is best-effort; the auth listener clears the user
      // even when the server call fails.
    }
    navigate('/', { replace: true })
  }

  const initial = (user?.email || user?.name || 'N').trim().charAt(0).toUpperCase()

  return (
    <header className="topbar">
      <Link to="/" aria-label="Nandha Music" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <Logo size={44} />
      </Link>

      <form className="topbar__search search-box" role="search" onSubmit={handleSearchSubmit}>
        <span className="search-box__icon" aria-hidden="true"><Icon name="search" size={18} /></span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t('common.searchPlaceholder')}
          aria-label={t('common.searchPlaceholder')}
        />
      </form>

      <div className="topbar__actions">
        <LanguageSwitcher />
        {!user ? (
          <div className="topbar__auth">
            <Link className="btn btn-ghost topbar__auth-btn" to="/login">
              {t('nav.signIn')}
            </Link>
            <Link className="btn btn-primary topbar__auth-btn" to="/login?mode=signup">
              {t('nav.signUp')}
            </Link>
          </div>
        ) : (
          <div className="topbar__account" ref={menuRef}>
            <button
              type="button"
              className="topbar__avatar"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`${t('nav.account')}: ${user.email || user.name || ''}`}
            >
              {initial}
            </button>
            {menuOpen && (
              <div className="topbar__menu" role="menu" aria-label={t('nav.account')}>
                {user.email && (
                  <div className="topbar__menu-email" aria-hidden="true">{user.email}</div>
                )}
                <Link role="menuitem" className="topbar__menu-item" to="/profile" onClick={() => setMenuOpen(false)}>
                  {t('nav.profile')}
                </Link>
                <Link role="menuitem" className="topbar__menu-item" to="/settings" onClick={() => setMenuOpen(false)}>
                  {t('nav.settings')}
                </Link>
                {isAdmin && (
                  <Link role="menuitem" className="topbar__menu-item" to="/admin" onClick={() => setMenuOpen(false)}>
                    {t('nav.admin')}
                  </Link>
                )}
                <button type="button" role="menuitem" className="topbar__menu-item" onClick={handleSignOut}>
                  {t('auth.signOut')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
