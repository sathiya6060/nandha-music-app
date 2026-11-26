import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { ADMIN_EMAILS, useAuth } from '../lib/auth.jsx'

/**
 * Route '/login' — deliberately NOT linked anywhere in the public UI.
 * The admin opens this URL directly (or from a bookmark).
 * Email + password sign-in via Supabase, or create the account here
 * (sign-up) — the admin account does not exist yet, so the toggle
 * matters. Google button kept. On success, the allowlisted admin
 * email goes to /admin, everyone else goes home. Listening needs no
 * account at all.
 */
export default function Login() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { user, isAdmin, loading, signInEmail, signUpEmail, signInGoogle } = useAuth()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  // Already signed in → go where you belong.
  useEffect(() => {
    if (loading || !user) return
    navigate(isAdmin ? '/admin' : '/', { replace: true })
  }, [user, isAdmin, loading, navigate])

  function goAfterSignIn(signedInUser) {
    const admin = ADMIN_EMAILS.includes(
      String(signedInUser?.email || '').trim().toLowerCase(),
    )
    navigate(admin ? '/admin' : '/', { replace: true })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    if (mode === 'signup') {
      const { user: created, session, error: err } = await signUpEmail(email.trim(), password)
      setBusy(false)
      if (err || !created) {
        setError(t('auth.signInError'))
        return
      }
      if (!session) {
        // Email confirmation is still required — tell the user plainly.
        setNotice(t('auth.confirmEmail'))
        setMode('signin')
        return
      }
      goAfterSignIn(created)
      return
    }
    const { user: signedIn, error: err } = await signInEmail(email.trim(), password)
    setBusy(false)
    if (err || !signedIn) {
      setError(t('auth.signInError'))
      return
    }
    goAfterSignIn(signedIn)
  }

  function switchMode(next) {
    setMode(next)
    setError('')
    setNotice('')
  }

  async function handleGoogle() {
    setError('')
    setBusy(true)
    const { error: err } = await signInGoogle()
    setBusy(false)
    // Supabase OAuth redirects away; on return the effect above routes.
    // In demo mode there is no redirect — the effect routes as well.
    if (err) setError(t('auth.signInError'))
  }

  if (loading) {
    return (
      <div className="page-head">
        <p>{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto' }}>
      <div className="page-head">
        <h1 className="page-head__title">{mode === 'signup' ? t('auth.signUp') : t('common.signIn')}</h1>
        <p className="page-head__sub">{mode === 'signup' ? t('auth.signUpHint') : t('auth.loginHint')}</p>
      </div>

      <form onSubmit={handleSubmit} className="inline-form" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <label htmlFor="login-email">{t('auth.email')}</label>
        <input
          id="login-email"
          className="input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="login-password">{t('auth.password')}</label>
        <input
          id="login-password"
          className="input"
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p role="alert" className="form-error">{error}</p>}
        {notice && <p role="status" className="topbar__notice">{notice}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? t('common.loading') : mode === 'signup' ? t('auth.signUp') : t('common.signIn')}
        </button>
      </form>

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
          disabled={busy}
        >
          {mode === 'signup' ? t('auth.switchToSignIn') : t('auth.switchToSignUp')}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-ghost" onClick={handleGoogle} disabled={busy}>
          {t('auth.signInGoogle')}
        </button>
      </div>
    </div>
  )
}
