import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'
import { resetPageMeta, setPageMeta } from '../lib/pageMeta.js'

/**
 * Profile (mobile audit, item 4): a real /profile route. The bottom
 * nav's Profile tab used to point at /library, so on /library BOTH the
 * Library and the Profile tabs lit up as active (aria-current="page"
 * on two tabs). Minimal but real: guests get a sign-in prompt; signed-in
 * users see their email + role and can sign out (admins also get the
 * Admin link). The full account / settings surface (playback,
 * language, notifications, privacy, delete account) is item 7 —
 * audit-only this round, not built here.
 */
export default function Profile() {
  const { t } = useI18n()
  const { user, role, signOut } = useAuth()

  useEffect(() => {
    setPageMeta({ title: t('nav.profile') })
    return resetPageMeta
  }, [t])

  if (!user) {
    return (
      <section className="page-head">
        <h1 className="page-head__title">{t('nav.profile')}</h1>
        <p className="page-head__sub">{t('profile.signInHint')}</p>
        <div className="profile-page__actions">
          <Link className="btn btn-primary" to="/login">{t('profile.signIn')}</Link>
          <Link className="btn btn-ghost" to="/login?mode=signup">{t('auth.switchToSignUp')}</Link>
        </div>
      </section>
    )
  }

  return (
    <section className="page-head">
      <h1 className="page-head__title">{t('nav.profile')}</h1>
      <dl className="profile-page__details">
        <div>
          <dt>{t('auth.email')}</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt>{t('auth.role')}</dt>
          <dd>{role === 'admin' ? t('auth.roleAdmin') : t('auth.roleListener')}</dd>
        </div>
      </dl>
      <div className="profile-page__actions">
        {role === 'admin' && (
          <Link className="btn btn-ghost" to="/admin">{t('nav.admin')}</Link>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => { signOut().catch(() => {}) }}>
          {t('auth.signOut')}
        </button>
      </div>
    </section>
  )
}
