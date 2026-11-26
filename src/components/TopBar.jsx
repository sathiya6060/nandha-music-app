import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import Logo from './Logo.jsx'
import Icon from './Icons.jsx'
import LanguageSwitcher from './LanguageSwitcher.jsx'

/**
 * Top bar: logo, desktop search, language switcher.
 * No sign-in button and no Admin link here — listening works with no
 * account at all, and /admin is reachable only via its own URL
 * (see src/pages/Login.jsx) for the allowlisted admin email.
 *
 * The search box follows the URL ?q= — the same single source of truth
 * as the in-page search box — so the two never disagree. The sync is
 * skipped while this input is focused, so typing here is never
 * clobbered by the in-page box writing its debounced query to the URL.
 */
export default function TopBar() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (focused) return
    setQuery(searchParams.get('q') || searchParams.get('genre') || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, focused])

  function handleSearchSubmit(e) {
    e.preventDefault()
    const q = query.trim()
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`)
    else navigate('/search')
  }

  return (
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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t('common.searchPlaceholder')}
          aria-label={t('common.searchPlaceholder')}
        />
      </form>

      <div className="topbar__actions">
        <LanguageSwitcher />
      </div>
    </header>
  )
}
