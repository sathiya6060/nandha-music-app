// Admin layout — grouped sidebar (desktop) + bottom tab bar (mobile),
// breadcrumb top bar, "+ New" menu, environment chip, account menu.
// ONLY the allowlisted admin email may open /admin (see
// src/lib/auth.jsx ADMIN_EMAILS). Not signed in → /login. Signed in but
// not admin → home. There is NO public "Access denied" page: the route
// itself never renders admin chrome for non-admins.
// Wrapped in LanguageProvider so the admin is self-contained for i18n;
// AuthProvider must still wrap this component from the app root.
import { useEffect, useRef, useState } from 'react'
import { NavLink, Navigate, Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { getAdminRedirect } from '../lib/adminGate.js'
import { onCatalogSourceChange } from '../lib/supabaseCatalog.js'
import { LanguageProvider, useI18n, LOCALES } from '../lib/i18n.js'
import StatusStrip from './components/StatusStrip.jsx'
import { NAV_GROUPS, NEW_MENU_ITEMS, getBreadcrumb } from './lib/adminNav.js'
import './admin.css'

// NEW accounts only — old @officialnandhamusic Instagram + old Page are backup.
const SOCIAL_LINKS = [
  { href: 'https://www.instagram.com/nandhamusic.official/', label: 'Instagram — @nandhamusic.official' },
  { href: 'https://www.facebook.com/profile.php?id=61596981507074', label: 'Facebook Page' },
  { href: 'https://youtube.com/@officialnandhamusic', label: 'YouTube — @officialnandhamusic' },
  { href: 'https://www.threads.com/@officialnandhamusic', label: 'Threads — @officialnandhamusic' },
]

const CONTENT_ROUTES = ['/admin/tracks', '/admin/albums', '/admin/artists', '/admin/lyrics', '/admin/playlists']
const MORE_ROUTES = ['/admin/users', '/admin/analytics', '/admin/settings']

function roleLabelKey(role) {
  if (role === 'admin') return 'auth.roleAdmin'
  if (role === 'artist') return 'auth.roleArtist'
  return 'auth.roleListener'
}

function envChipClass(env) {
  if (env === 'live') return 'admin-env-chip admin-env-chip--live'
  if (env === 'demo') return 'admin-env-chip admin-env-chip--demo'
  return 'admin-env-chip admin-env-chip--checking'
}

function envLabelKey(env) {
  if (env === 'live') return 'admin.envLive'
  if (env === 'demo') return 'admin.envDemo'
  return 'admin.envChecking'
}

function AdminLayoutInner() {
  const { user, role, isAdmin, signOut, loading } = useAuth()
  const { t, lang, setLang, locales } = useI18n()
  const location = useLocation()
  // Environment chip: 'checking' until the first catalog fetch
  // settles; onCatalogSourceChange calls back immediately when a
  // fetch has already settled, so a late mount still shows Live /
  // Demo data instead of sticking on "Checking…".
  const [env, setEnv] = useState('checking')
  const [newMenuOpen, setNewMenuOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  // Mobile sheets: { type: 'content' | 'more', pathname } | null.
  // The pathname is captured when the sheet opens; the sheet only
  // renders while the route still matches, so navigating (link tap,
  // back/forward) closes it with no setState-in-effect.
  const [mobileSheet, setMobileSheet] = useState(null)
  const newMenuRef = useRef(null)
  const accountMenuRef = useRef(null)

  useEffect(
    () =>
      onCatalogSourceChange((source) => {
        setEnv(source === 'supabase' ? 'live' : 'demo')
      }),
    [],
  )

  // Esc closes any open menu/sheet; a pointer down outside an open
  // top-bar menu closes it. (Sheets close via their backdrop button.)
  useEffect(() => {
    if (!newMenuOpen && !accountMenuOpen && !mobileSheet) return undefined
    const onPointerDown = (event) => {
      if (newMenuRef.current && !newMenuRef.current.contains(event.target)) setNewMenuOpen(false)
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setAccountMenuOpen(false)
      }
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setNewMenuOpen(false)
        setAccountMenuOpen(false)
        setMobileSheet(null)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [newMenuOpen, accountMenuOpen, mobileSheet])

  // Close the mobile sheet when the route changes (a sheet link was
  // tapped) — derived during render from the captured pathname, so no
  // effect is needed.
  const sheetVisible =
    mobileSheet && mobileSheet.pathname === location.pathname ? mobileSheet.type : null

  // Arrow-key navigation inside the "+ New" menu.
  const onNewMenuKeyDown = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = [...(newMenuRef.current?.querySelectorAll('[role="menuitem"]') || [])]
    if (items.length === 0) return
    const index = items.indexOf(document.activeElement)
    const next =
      event.key === 'ArrowDown'
        ? (index + 1) % items.length
        : (index - 1 + items.length) % items.length
    items[next]?.focus()
  }

  if (loading) {
    return (
      <div className="admin-shell admin-shell--loading">
        <div className="admin-skeleton-rail" aria-hidden="true">
          <div className="admin-skeleton admin-skeleton--brand" />
          <div className="admin-skeleton admin-skeleton--nav" />
          <div className="admin-skeleton admin-skeleton--nav" />
          <div className="admin-skeleton admin-skeleton--nav" />
          <div className="admin-skeleton admin-skeleton--nav" />
        </div>
        <div className="admin-main">
          <header className="admin-topbar">
            <div className="admin-skeleton admin-skeleton--topbar" aria-hidden="true" />
          </header>
          <main className="admin-content" aria-busy="true">
            <div className="admin-skeleton admin-skeleton--line" aria-hidden="true" />
            <div className="admin-skeleton admin-skeleton--line admin-skeleton--line-short" aria-hidden="true" />
            <div className="admin-skeleton admin-skeleton--block" aria-hidden="true" />
          </main>
        </div>
        <span className="admin-sr-only" role="status">
          {t('common.loading')}
        </span>
      </div>
    )
  }

  // Not signed in → the (unlinked) login page. Signed in but not admin
  // → home. No admin chrome ever renders for a non-admin.
  // (Decision lives in src/lib/adminGate.js — unit-tested, see
  // adminGate.test.js.)
  const redirect = getAdminRedirect({ user, isAdmin, loading })
  if (redirect) return <Navigate to={redirect} replace />

  const crumbs = getBreadcrumb(location.pathname)
  const pathname = location.pathname
  const isContentRoute = CONTENT_ROUTES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  const isMoreRoute = MORE_ROUTES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link to="/" className="admin-brand">
          <img src="/assets/nandha-logo.png" alt="Nandha Music" className="admin-brand-logo" />
          <span>
            <span className="admin-brand-text">NANDHA MUSIC</span>
            <span className="admin-brand-tagline">{t('app.tagline')}</span>
          </span>
        </Link>
        <nav className="admin-nav" aria-label={t('admin.dashboard')}>
          {NAV_GROUPS.map((group) => (
            <div key={group.groupKey || 'dashboard'} className="admin-nav-group">
              {group.groupKey && (
                <span className="admin-nav-group-label">{t(group.groupKey)}</span>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `admin-nav-link${isActive ? ' is-active' : ''}`}
                >
                  {t(item.key)}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar-foot">
          <div className="admin-sidebar-social">
            {SOCIAL_LINKS.map((s) => (
              <a key={s.href} href={s.href} target="_blank" rel="noreferrer">
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-row">
            <nav className="admin-crumbs" aria-label={t('admin.breadcrumb')}>
              <ol>
                {crumbs.map((crumb) => (
                  <li key={crumb.labelKey} aria-current={crumb.to ? undefined : 'page'}>
                    {crumb.to ? <Link to={crumb.to}>{t(crumb.labelKey)}</Link> : t(crumb.labelKey)}
                  </li>
                ))}
              </ol>
            </nav>
            <div className="admin-topbar-actions">
              <div className="admin-menu-wrap" ref={newMenuRef}>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  aria-haspopup="menu"
                  aria-expanded={newMenuOpen}
                  aria-controls="admin-new-menu"
                  onClick={() => setNewMenuOpen((open) => !open)}
                >
                  + {t('admin.newMenu')}
                </button>
                {newMenuOpen && (
                  <div
                    id="admin-new-menu"
                    className="admin-menu"
                    role="menu"
                    tabIndex={-1}
                    onKeyDown={onNewMenuKeyDown}
                  >
                    {NEW_MENU_ITEMS.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        role="menuitem"
                        className="admin-menu-item"
                        onClick={() => setNewMenuOpen(false)}
                      >
                        {t(item.key)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <span className={envChipClass(env)} role="status">
                {t(envLabelKey(env))}
              </span>
              <div className="admin-menu-wrap" ref={accountMenuRef}>
                <button
                  type="button"
                  className="admin-btn admin-account-btn"
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  aria-controls="admin-account-menu"
                  onClick={() => setAccountMenuOpen((open) => !open)}
                >
                  <span className="admin-account-email">{user ? user.email : t('auth.notSignedIn')}</span>
                  <span className="admin-badge admin-badge-role">{t(roleLabelKey(role))}</span>
                </button>
                {accountMenuOpen && (
                  <div id="admin-account-menu" className="admin-menu" role="menu">
                    <Link
                      to="/"
                      role="menuitem"
                      className="admin-menu-item"
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      {t('nav.backToApp')}
                    </Link>
                    {user && (
                      <button
                        type="button"
                        role="menuitem"
                        className="admin-menu-item"
                        onClick={() => {
                          setAccountMenuOpen(false)
                          signOut()
                        }}
                      >
                        {t('auth.signOut')}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <label className="admin-topbar-field">
                {t('common.language')}:
                <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('common.language')}>
                  {locales.map((code) => (
                    <option key={code} value={code}>
                      {LOCALES[code]?.label || code}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </header>

        <StatusStrip />

        <main className="admin-content">
          <Outlet />
        </main>
      </div>

      <nav className="admin-tabbar" aria-label={t('admin.dashboard')}>
        <NavLink
          to="/admin"
          end
          className={({ isActive }) => `admin-tab${isActive ? ' is-active' : ''}`}
        >
          <span className="admin-tab-label">{t('admin.tabDashboard')}</span>
        </NavLink>
        <button
          type="button"
          className={`admin-tab${isContentRoute || sheetVisible === 'content' ? ' is-active' : ''}`}
          aria-expanded={sheetVisible === 'content'}
          aria-controls="admin-sheet-content"
          onClick={() =>
            setMobileSheet((sheet) =>
              sheet?.type === 'content' ? null : { type: 'content', pathname },
            )
          }
        >
          <span className="admin-tab-label">{t('admin.tabContent')}</span>
        </button>
        <NavLink
          to="/admin/tracks/new"
          className={({ isActive }) => `admin-tab admin-tab--upload${isActive ? ' is-active' : ''}`}
        >
          <span className="admin-tab-label">{t('admin.tabUpload')}</span>
        </NavLink>
        <button
          type="button"
          className={`admin-tab${isMoreRoute || sheetVisible === 'more' ? ' is-active' : ''}`}
          aria-expanded={sheetVisible === 'more'}
          aria-controls="admin-sheet-more"
          onClick={() =>
            setMobileSheet((sheet) => (sheet?.type === 'more' ? null : { type: 'more', pathname }))
          }
        >
          <span className="admin-tab-label">{t('admin.tabMore')}</span>
        </button>
      </nav>

      {sheetVisible === 'content' && (
        <div className="admin-sheet-layer">
          <button
            type="button"
            className="admin-sheet-backdrop"
            aria-label={t('common.close')}
            onClick={() => setMobileSheet(null)}
          />
          <div id="admin-sheet-content" className="admin-sheet" role="dialog" aria-label={t('admin.tabContent')}>
            <div className="admin-sheet-head">
              <span className="admin-sheet-title">{t('admin.navContent')}</span>
              <button
                type="button"
                className="admin-btn admin-btn-ghost admin-sheet-close"
                aria-label={t('common.close')}
                onClick={() => setMobileSheet(null)}
              >
                ✕
              </button>
            </div>
            {NAV_GROUPS[1].items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `admin-nav-link${isActive ? ' is-active' : ''}`}
                onClick={() => setMobileSheet(null)}
              >
                {t(item.key)}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {sheetVisible === 'more' && (
        <div className="admin-sheet-layer">
          <button
            type="button"
            className="admin-sheet-backdrop"
            aria-label={t('common.close')}
            onClick={() => setMobileSheet(null)}
          />
          <div id="admin-sheet-more" className="admin-sheet" role="dialog" aria-label={t('admin.tabMore')}>
            <div className="admin-sheet-head">
              <span className="admin-sheet-title">{t('admin.tabMore')}</span>
              <button
                type="button"
                className="admin-btn admin-btn-ghost admin-sheet-close"
                aria-label={t('common.close')}
                onClick={() => setMobileSheet(null)}
              >
                ✕
              </button>
            </div>
            {[...NAV_GROUPS[2].items, ...NAV_GROUPS[3].items, ...NAV_GROUPS[4].items].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `admin-nav-link${isActive ? ' is-active' : ''}`}
                onClick={() => setMobileSheet(null)}
              >
                {t(item.key)}
              </NavLink>
            ))}
            <Link to="/" className="admin-nav-link" onClick={() => setMobileSheet(null)}>
              {t('nav.backToApp')}
            </Link>
            {user && (
              <button
                type="button"
                className="admin-btn admin-btn-ghost admin-sheet-signout"
                onClick={() => {
                  setMobileSheet(null)
                  signOut()
                }}
              >
                {t('auth.signOut')}
              </button>
            )}
            <div className="admin-sidebar-social">
              {SOCIAL_LINKS.map((s) => (
                <a key={s.href} href={s.href} target="_blank" rel="noreferrer">
                  {s.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminLayout() {
  return (
    <LanguageProvider>
      <AdminLayoutInner />
    </LanguageProvider>
  )
}
