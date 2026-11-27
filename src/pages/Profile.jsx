import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'
import { useToast } from '../lib/toast.jsx'
import { resetPageMeta, setPageMeta } from '../lib/pageMeta.js'
import { deleteAccount } from '../lib/deleteAccount.js'
import { clearLocalData } from '../lib/localData.js'

/**
 * Profile (mobile audit, items 4 + 7): a real /profile route.
 * Guests get a sign-in prompt; signed-in users see their account
 * (email, role, member since), a link to /settings (the ONE settings
 * surface — playback, language, notifications, privacy), sign out,
 * and delete account.
 *
 * Delete account (item 7): two-step confirmation. The deletion goes
 * through the delete-account Edge Function (the client never holds
 * the service_role key). If the function is not deployed yet the UI
 * says so honestly ("email us") and deletes nothing — the deletion
 * is never faked. In demo mode there is no server account at all, so
 * deleting just clears local data and signs out. On success the
 * local data is cleared too, then the user is signed out.
 */
export default function Profile() {
  const { t } = useI18n()
  const { user, role, isDemo, signOut } = useAuth()
  const navigate = useNavigate()
  const showToast = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteMsg, setDeleteMsg] = useState('')
  const [deleting, setDeleting] = useState(false)

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

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString()
    : null

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    setDeleteMsg('')
    try {
      if (isDemo) {
        // Demo mode: the "account" is entirely local.
        clearLocalData()
        await signOut().catch(() => {})
        showToast?.(t('profile.deleteDone'))
        navigate('/', { replace: true })
        return
      }
      const result = await deleteAccount()
      if (result.ok) {
        clearLocalData()
        await signOut().catch(() => {})
        showToast?.(t('profile.deleteDone'))
        navigate('/', { replace: true })
        return
      }
      // Not deployed yet — say so honestly, delete nothing, stay
      // signed in. Any other failure: same, with the generic text.
      setDeleteMsg(result.reason === 'not-deployed' ? t('profile.deleteUnavailable') : t('profile.deleteFailed'))
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="settings-page">
      <div className="page-head">
        <h1 className="page-head__title">{t('nav.profile')}</h1>
      </div>

      <section className="settings-section" aria-label={t('profile.account')}>
        <h2>{t('profile.account')}</h2>
        <dl className="profile-page__details">
          <div>
            <dt>{t('auth.email')}</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>{t('auth.role')}</dt>
            <dd>{role === 'admin' ? t('auth.roleAdmin') : t('auth.roleListener')}</dd>
          </div>
          {memberSince && (
            <div>
              <dt>{t('profile.memberSince')}</dt>
              <dd>{memberSince}</dd>
            </div>
          )}
        </dl>
        <div className="profile-page__actions">
          {role === 'admin' && (
            <Link className="btn btn-ghost" to="/admin">{t('nav.admin')}</Link>
          )}
          <Link className="btn btn-ghost" to="/settings">{t('nav.settings')}</Link>
          <button type="button" className="btn btn-ghost" onClick={() => { signOut().catch(() => {}) }}>
            {t('auth.signOut')}
          </button>
        </div>
        <p className="settings-hint">{t('profile.settingsLink')}</p>
      </section>

      <section className="settings-section settings-section--danger" aria-label={t('profile.deleteAccount')}>
        <h2>{t('profile.deleteAccount')}</h2>
        <p className="settings-hint" style={{ marginTop: 0 }}>{t('profile.deleteHint')}</p>
        {deleteMsg && <p role="alert" className="settings-hint">{deleteMsg}</p>}
        {confirmDelete ? (
          <div className="profile-page__actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={deleting}
              onClick={handleDelete}
            >
              {t('profile.deleteConfirm')}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
            >
              {t('profile.deleteCancel')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setConfirmDelete(true)}
          >
            {t('profile.deleteAccount')}
          </button>
        )}
      </section>
    </div>
  )
}
