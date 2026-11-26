import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import Logo from './Logo.jsx'
import Icon from './Icons.jsx'
import LanguageSwitcher from './LanguageSwitcher.jsx'

/**
 * Top bar: logo, desktop search, language switcher, Admin link, demo
 * sign-in button. Auth is handled elsewhere — in demo mode the sign-in
 * button opens an inline notice instead of navigating to a login page.
 */
export default function TopBar() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [showNotice, setShowNotice] = useState(false)

  function handleSearchSubmit(e) {
    e.preventDefault()
    const q = query.trim()
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`)
    else navigate('/search')
  }

  return (
    <>
      <header className="topbar">
        <Link to="/" aria-label="Nandha Music" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <Logo size={36} />
        </Link>

        <form className="topbar__search search-box" role="search" onSubmit={handleSearchSubmit}>
          <span className="search-box__icon" aria-hidden="true"><Icon name="search" size={18} /></span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('common.searchPlaceholder')}
            aria-label={t('common.searchPlaceholder')}
          />
        </form>

        <div className="topbar__actions">
          <LanguageSwitcher />
          <Link className="btn btn-ghost btn-sm" to="/admin">{t('nav.admin')}</Link>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowNotice((v) => !v)}
            aria-expanded={showNotice}
          >
            {t('auth.demoSignIn')}
          </button>
        </div>
      </header>
      {showNotice && (
        <p className="topbar__notice" role="status">
          {t('auth.demoNotice')}
          <button
            type="button"
            onClick={() => setShowNotice(false)}
            aria-label={t('common.close')}
            style={{ background: 'none', border: 0, color: 'inherit', marginLeft: 8, minWidth: 44, minHeight: 44 }}
          >
            <Icon name="close" size={18} />
          </button>
        </p>
      )}
    </>
  )
}
