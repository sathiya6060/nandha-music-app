import { NavLink } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import Logo from './Logo.jsx'
import Icon from './Icons.jsx'

/**
 * Spotify-style mobile bottom nav (visible < 1024px) + desktop left nav.
 * One shared inline-SVG icon set (Icons.jsx), one stroke weight.
 * Tabs: Home, Search, Library, Playlists, Profile (Profile links to
 * /library in v1 — no separate profile page yet). Active = Amber Gold,
 * inactive = Steel Grey. Min 44px tap targets.
 */
const NAV_ITEMS = [
  { to: '/', labelKey: 'nav.home', icon: 'home', end: true },
  { to: '/search', labelKey: 'nav.search', icon: 'search' },
  { to: '/library', labelKey: 'nav.library', icon: 'library' },
  { to: '/liked', labelKey: 'nav.liked', icon: 'heart' },
  { to: '/playlists', labelKey: 'nav.playlists', icon: 'playlists' },
  { to: '/epk', labelKey: 'nav.epk', icon: 'flame' },
]

const BOTTOM_ITEMS = [
  { to: '/', labelKey: 'nav.home', icon: 'home', end: true },
  { to: '/search', labelKey: 'nav.search', icon: 'search' },
  { to: '/library', labelKey: 'nav.library', icon: 'library' },
  { to: '/playlists', labelKey: 'nav.playlists', icon: 'playlists' },
  { to: '/library', labelKey: 'nav.profile', icon: 'profile' },
]

function getRole(roleProp) {
  if (roleProp) return roleProp
  try {
    return localStorage.getItem('nandha-role') || 'listener'
  } catch {
    return 'listener'
  }
}

/**
 * Desktop left navigation (visible >= 1024px via CSS).
 * Props: { role } — 'admin' shows the Admin link; defaults to the
 * demo role stored in localStorage ('nandha-role') or 'listener'.
 * The lockup is the transparent logo + 'NANDHA MUSIC' text (the approved
 * N-first lockup composition). /assets/nandha-lockup.png ships on a white
 * background, so it is used as a press asset on the EPK page, not on the
 * dark sidebar.
 */
export default function Sidebar({ role }) {
  const { t } = useI18n()
  const effectiveRole = getRole(role)

  return (
    <aside className="sidebar" aria-label={t('nav.main')}>
      <div className="sidebar__logo">
        <Logo size={40} />
        <span style={{ fontWeight: 800, color: 'var(--text-strong)', fontSize: '1.05rem', letterSpacing: '0.02em' }}>
          NANDHA MUSIC
        </span>
      </div>
      <nav className="sidebar__nav" aria-label={t('nav.main')}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `sidebar__link${isActive ? ' is-active' : ''}`}
          >
            <Icon name={item.icon} size={20} />
            {t(item.labelKey)}
          </NavLink>
        ))}
        {effectiveRole === 'admin' && (
          <>
            <p className="sidebar__section-label">{t('nav.admin')}</p>
            <NavLink
              to="/admin"
              className={({ isActive }) => `sidebar__link${isActive ? ' is-active' : ''}`}
            >
              <Icon name="settings" size={20} />
              {t('nav.admin')}
            </NavLink>
          </>
        )}
      </nav>
    </aside>
  )
}

/** Mobile bottom navigation (visible < 1024px via CSS). */
export function BottomNav() {
  const { t } = useI18n()
  return (
    <nav className="bottom-nav" aria-label={t('nav.main')}>
      {BOTTOM_ITEMS.map((item) => (
        <NavLink
          key={`${item.to}-${item.labelKey}`}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `bottom-nav__link${isActive ? ' is-active' : ''}`}
        >
          {({ isActive }) => (
            <>
              <span className="bottom-nav__icon">
                <Icon name={item.icon} size={24} />
              </span>
              {t(item.labelKey)}
              {isActive ? <span className="sr-only">(current)</span> : null}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
