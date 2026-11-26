import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { ADMIN_EMAILS, useAuth } from '../lib/auth.jsx'

/**
 * Route '/login' — deliberately NOT linked anywhere in the public UI.
 * The admin opens this URL directly (or from a bookmark).
 * Email + password sign-in via Supabase, or create the account here
 * (sign-up). On success, the allowlisted admin email goes to /admin,
 * everyone else goes home. Listening needs no account at all.
 *
 * Google sign-in is HIDDEN (27 Nov 2026): the Google provider is
 * DISABLED in Supabase Auth (Email is enabled), so the button would
 * be dead. The code stays in src/lib/auth.jsx (signInGoogle /
 * signInWithOAuth('google')) — show the button again once Google
 * OAuth is configured in the Supabase dashboard.
 */
export default function Login() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { user, isAdmin, loading, configError, signInEmail, signUpEmail } = useAuth()
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
      // L4: Supabase rejects passwords under 6 characters server-side —
      // say so specifically instead of the generic sign-in error.
      if (password.length < 6) {
        setError(t('auth.passwordTooShort'))
        setBusy(false)
        return
      }
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

      {/* M2c: misconfigured backend (no Supabase, no demo flag) — sign-in
          is unavailable. The form below is disabled; this is the visible
          fail-closed state, not a silent demo fallback. */}
      {configError && (
        <p role="alert" className="form-error">{t('auth.configError')}</p>
      )}

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
          disabled={configError}
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
          minLength={mode === 'signup' ? 6 : undefined}
          disabled={configError}
        />
        {error && <p role="alert" className="form-error">{error}</p>}
        {notice && <p role="status" className="topbar__notice">{notice}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy || configError}>
          {busy ? t('common.loading') : mode === 'signup' ? t('auth.signUp') : t('common.signIn')}
        </button>
      </form>

      {/* Consent note (Fix 9): creating an account means agreeing to the
          Privacy Policy and Terms — linked, never buried. */}
      <p className="auth-consent">
        {t('auth.consentNote')}{' '}
        <Link to="/privacy">{t('legal.privacy')}</Link>
        {' '}{t('common.and')}{' '}
        <Link to="/terms">{t('legal.terms')}</Link>.
      </p>

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
          disabled={busy || configError}
        >
          {mode === 'signup' ? t('auth.switchToSignIn') : t('auth.switchToSignUp')}
        </button>
      </div>

      {/* Google sign-in hidden (27 Nov 2026): the Google provider is
          DISABLED in Supabase Auth, so the button would be dead.
          Re-enable by restoring the button below + handleGoogle()
          calling signInGoogle() from useAuth() — the OAuth code stays
          in src/lib/auth.jsx. The 'auth.signInGoogle' locale key is
          kept for that day. */}
    </div>
  )
}
