// Auth — Supabase Auth when configured, demo mode ONLY with the
// explicit VITE_DEMO_MODE=true flag, and fail-closed when neither is
// available. (M2, OpenCodeReview 26 Nov 2026: missing Supabase vars
// alone used to silently enable demo mode, and any password + the
// public brand email yielded admin. Both are fixed: demo needs the
// flag, and demo NEVER grants admin — every demo sign-in is a
// listener. The admin allowlist applies in Supabase mode only. When
// Supabase is absent and the flag is off, sign-in is unavailable and
// the login page shows a configuration error instead of silently
// falling back to demo.)
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'
import { isDemoMode } from './config.js'

const DEMO_ROLE_KEY = 'nandha-demo-role'
const DEMO_USER = { id: 'demo-user', email: 'demo@nandhamusic.app', name: 'Demo User' }

/** The ONLY account that may access /admin. Case-insensitive. */
export const ADMIN_EMAILS = ['officialnandhamusic@gmail.com']

// Kept for the admin demo-role switcher UI; in demo mode setDemoRole
// clamps every request to 'listener', so 'admin'/'artist' here never
// grant anything (M2).
export const DEMO_ROLES = ['admin', 'artist', 'listener']

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase())
}

/**
 * Demo mode grants ONE role only: 'listener' (M2). The admin allowlist
 * does not apply in demo — any email, including the public brand
 * email, signs in as a listener at most.
 */
function clampDemoRole() {
  return 'listener'
}

function roleFromSupabaseUser(sbUser) {
  if (!sbUser) return 'listener'
  if (isAdminEmail(sbUser.email)) return 'admin'
  // L1: app_metadata only. user_metadata is user-writable, so it must
  // never decide a role.
  const metaRole = sbUser.app_metadata?.role
  return metaRole === 'artist' ? 'artist' : 'listener'
}

function isSupabaseConfigured() {
  return Boolean(
    supabase &&
      import.meta.env?.VITE_SUPABASE_URL &&
      import.meta.env?.VITE_SUPABASE_ANON_KEY,
  )
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState('listener')
  const [loading, setLoading] = useState(true)
  // Demo mode only with the explicit flag (M2) — never from missing
  // Supabase vars alone.
  const [isDemo, setIsDemo] = useState(isDemoMode)
  // True when neither Supabase nor demo mode is available (M2c):
  // sign-in is then unavailable and the login page must say so.
  const [configError, setConfigError] = useState(false)

  // Demo mode is listener-only (M2): whatever a previous session
  // stored (including a stale 'admin') is ignored — the role is
  // 'listener'. The stored key is kept for compat and always holds
  // 'listener' now.
  const [demoRole, setDemoRoleState] = useState('listener')

  useEffect(() => {
    if (isSupabaseConfigured()) {
      setIsDemo(false)
      setConfigError(false)
      let mounted = true
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (!mounted) return
          const sbUser = data?.session?.user || null
          setUser(sbUser)
          setRole(roleFromSupabaseUser(sbUser))
          setLoading(false)
        })
        .catch(() => {
          if (mounted) setLoading(false)
        })

      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        const sbUser = session?.user || null
        setUser(sbUser)
        setRole(roleFromSupabaseUser(sbUser))
        setLoading(false)
      })
      return () => {
        mounted = false
        listener?.subscription?.unsubscribe()
      }
    }

    if (isDemoMode) {
      // DEMO MODE (explicit flag only) — no backend: a signed-in demo
      // user, always a listener (M2b). Never an admin, for any email.
      setIsDemo(true)
      setConfigError(false)
      setUser({ ...DEMO_USER, role: 'listener' })
      setRole('listener')
      setLoading(false)
      return undefined
    }

    // MISCONFIGURED (M2c) — no Supabase and no demo flag: fail closed.
    // No silent demo fallback, no signed-in user, no admin.
    setIsDemo(false)
    setConfigError(true)
    setUser(null)
    setRole('listener')
    setLoading(false)
    return undefined
  }, [demoRole])

  /**
   * Demo-mode role switch (admin demo bar). Demo mode is listener-only
   * (M2): any requested role — including 'admin' — is clamped to
   * 'listener', so the switcher can never grant admin. The requested
   * value is validated against DEMO_ROLES but otherwise ignored.
   */
  const setDemoRole = (nextRole) => {
    if (nextRole && !DEMO_ROLES.includes(nextRole)) return
    const safeRole = clampDemoRole()
    try {
      localStorage.setItem(DEMO_ROLE_KEY, safeRole)
    } catch {
      // ignore storage failures — role still applies for this session
    }
    setDemoRoleState(safeRole)
    setRole(safeRole)
    setUser((u) => (u ? { ...u, role: safeRole } : { ...DEMO_USER, role: safeRole }))
  }

  const signInEmail = async (email, password) => {
    if (!isSupabaseConfigured()) {
      if (isDemoMode) {
        // DEMO MODE: everyone signs in as a listener (M2b) — the admin
        // allowlist does not apply in demo, for any email or password.
        const demoUser = { ...DEMO_USER, email: email || DEMO_USER.email, role: 'listener' }
        setDemoRole('listener')
        setUser(demoUser)
        return { user: demoUser, error: null }
      }
      // MISCONFIGURED (M2c): no backend, no demo flag — refuse sign-in.
      return { user: null, error: { message: 'config_error' } }
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error && data?.user) {
      setUser(data.user)
      setRole(roleFromSupabaseUser(data.user))
    }
    return { user: data?.user || null, error }
  }

  const signUpEmail = async (email, password) => {
    if (!isSupabaseConfigured()) {
      // DEMO MODE: creating an account is the same as signing in —
      // listener-only (M2b). Misconfigured: signInEmail refuses.
      return signInEmail(email, password)
    }
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (!error && data?.user) {
      setUser(data.user)
      setRole(roleFromSupabaseUser(data.user))
    }
    // data.session is null when email confirmation is required — the
    // caller shows the confirm-email hint in that case.
    return { user: data?.user || null, session: data?.session || null, error }
  }

  const signInGoogle = async () => {
    if (!isSupabaseConfigured()) {
      if (isDemoMode) {
        // DEMO MODE: Google sign-in signs in as a listener (M2b).
        const demoUser = { ...DEMO_USER, role: 'listener' }
        setUser(demoUser)
        return { user: demoUser, error: null }
      }
      // MISCONFIGURED (M2c): no backend, no demo flag — refuse sign-in.
      return { user: null, error: { message: 'config_error' } }
    }
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google' })
    return { user: data?.user || null, error }
  }

  const signOut = async () => {
    if (!isSupabaseConfigured()) {
      setUser(null)
      setRole('listener')
      return { error: null }
    }
    const { error } = await supabase.auth.signOut()
    if (!error) {
      setUser(null)
      setRole('listener')
    }
    return { error }
  }

  const value = useMemo(
    () => ({
      user,
      role,
      isAdmin: role === 'admin',
      isArtist: role === 'artist',
      isDemo,
      demoRole,
      configError,
      signInEmail,
      signUpEmail,
      signInGoogle,
      signOut,
      setDemoRole,
      loading,
    }),
    // signIn*/signOut/setDemoRole are stable closures over state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, role, isDemo, demoRole, configError, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export default AuthContext
