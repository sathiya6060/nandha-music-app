// Admin layout — sidebar navigation + role guard.
// Allowed roles: admin and artist. Listeners (and signed-out visitors)
// see an "Access denied" empty state instead of any admin content.
// Wrapped in LanguageProvider so the admin is self-contained for i18n;
// AuthProvider must still wrap this component from the app root.
import { NavLink, Outlet, Link } from 'react-router-dom'
import { useAuth, DEMO_ROLES } from '../lib/auth.jsx'
import { LanguageProvider, useI18n, LOCALES } from '../lib/i18n.js'
import './admin.css'

const NAV_ITEMS = [
  { to: '/admin', key: 'admin.dashboard', end: true },
  { to: '/admin/tracks', key: 'admin.tracks' },
  { to: '/admin/albums', key: 'admin.albums' },
  { to: '/admin/artists', key: 'admin.artists' },
  { to: '/admin/lyrics', key: 'admin.lyrics' },
  { to: '/admin/playlists', key: 'admin.playlists' },
  { to: '/admin/users', key: 'admin.users' },
  { to: '/admin/analytics', key: 'admin.analytics' },
  { to: '/admin/settings', key: 'admin.siteSettings' },
]

// NEW accounts only — old @officialnandhamusic Instagram + old Page are backup.
const SOCIAL_LINKS = [
  { href: 'https://www.instagram.com/nandhamusic.official/', label: 'Instagram — @nandhamusic.official' },
  { href: 'https://www.facebook.com/profile.php?id=61596981507074', label: 'Facebook Page' },
  { href: 'https://youtube.com/@officialnandhamusic', label: 'YouTube — @officialnandhamusic' },
  { href: 'https://www.threads.com/@officialnandhamusic', label: 'Threads — @officialnandhamusic' },
]

function roleLabelKey(role) {
  if (role === 'admin') return 'auth.roleAdmin'
  if (role === 'artist') return 'auth.roleArtist'
  return 'auth.roleListener'
}

function AdminLayoutInner() {
  const { user, role, isAdmin, isArtist, isDemo, setDemoRole, signOut, loading } = useAuth()
  const { t, lang, setLang, locales } = useI18n()

  if (loading) {
    return (
      <div className="admin-shell">
        <div className="admin-empty">
          <h2>{t('common.loading')}</h2>
        </div>
      </div>
    )
  }

  const allowed = isAdmin || isArtist

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
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `admin-nav-link${isActive ? ' is-active' : ''}`}
            >
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-social">
          {SOCIAL_LINKS.map((s) => (
            <a key={s.href} href={s.href} target="_blank" rel="noreferrer">
              {s.label}
            </a>
          ))}
        </div>
        <div className="admin-sidebar-foot">
          <Link to="/" className="admin-nav-link">
            {t('nav.backToApp')}
          </Link>
          {user && (
            <button type="button" className="admin-btn admin-btn-ghost" onClick={signOut}>
              {t('auth.signOut')}
            </button>
          )}
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-user">
            <span className="admin-user-email">{user ? user.email : t('auth.notSignedIn')}</span>
            <span className="admin-badge admin-badge-role">{t(roleLabelKey(role))}</span>
            <label className="admin-demo-role">
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
          {isDemo && (
            <div className="admin-demo-bar" role="status">
              <span>{t('admin.demoNotice')}</span>
              <label className="admin-demo-role">
                {t('auth.demoRole')}:
                <select
                  value={role}
                  onChange={(e) => setDemoRole(e.target.value)}
                  aria-label={t('auth.demoRole')}
                >
                  {DEMO_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(roleLabelKey(r))}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </header>

        <main className="admin-content">
          {!allowed ? (
            <div className="admin-empty">
              <h2>{t('admin.accessDenied')}</h2>
              <p>{t('admin.accessDeniedHint')}</p>
              <p>
                {t('admin.signedInAs', { role: t(roleLabelKey(role)) })}
                {user ? ` — ${user.email}` : ''}
              </p>
              <Link to="/" className="admin-btn admin-btn-primary">
                {t('nav.backToApp')}
              </Link>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
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
