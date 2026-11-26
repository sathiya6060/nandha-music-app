// Auth — Supabase Auth when configured, otherwise DEMO MODE.
// Demo mode: role is stored in localStorage ('nandha-demo-role') and any
// email signs in; the role is derived from the email address.
// ADMIN ACCESS: only the allowlisted email below is ever an admin — in
// BOTH Supabase mode and demo mode. No other email, substring or stored
// role can grant admin. The UI must clearly label demo mode so it is
// never mistaken for real auth.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'

const DEMO_ROLE_KEY = 'nandha-demo-role'
const DEMO_USER = { id: 'demo-user', email: 'demo@nandhamusic.app', name: 'Demo User' }

/** The ONLY account that may access /admin. Case-insensitive. */
export const ADMIN_EMAILS = ['officialnandhamusic@gmail.com']

export const DEMO_ROLES = ['admin', 'artist', 'listener']

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase())
}

/**
 * Clamp a requested role: 'admin' survives only for the allowlisted
 * email. Anything else falls back to 'listener' (artist is unaffected).
 */
function clampRole(role, email) {
  if (role === 'admin' && !isAdminEmail(email)) return 'listener'
  return role
}

function roleFromSupabaseUser(sbUser) {
  if (!sbUser) return 'listener'
  if (isAdminEmail(sbUser.email)) return 'admin'
  const metaRole = sbUser.app_metadata?.role || sbUser.user_metadata?.role
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
  const [isDemo, setIsDemo] = useState(!isSupabaseConfigured())

  // Demo-mode role persisted in localStorage — clamped on read so a
  // stale stored 'admin' never grants admin without the allowlisted email.
  const [demoRole, setDemoRoleState] = useState(() => {
    try {
      const stored = localStorage.getItem(DEMO_ROLE_KEY) || 'listener'
      return clampRole(stored, DEMO_USER.email)
    } catch {
      return 'listener'
    }
  })

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      // DEMO MODE — no backend: signed-in demo user with the stored role,
      // clamped so a stale stored 'admin' never grants admin without the
      // allowlisted email.
      setIsDemo(true)
      const safeRole = clampRole(demoRole, DEMO_USER.email)
      setUser({ ...DEMO_USER, role: safeRole })
      setRole(safeRole)
      setLoading(false)
      return undefined
    }

    setIsDemo(false)
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
  }, [demoRole])

  /**
   * Demo-mode role switch (admin demo bar). 'admin' is accepted only
   * when the current demo user's email is allowlisted; otherwise the
   * request is clamped to 'listener'. `emailForCheck` lets sign-in pass
   * the just-entered email instead of the previous user's.
   */
  const setDemoRole = (nextRole, emailForCheck) => {
    if (!DEMO_ROLES.includes(nextRole)) return
    const email = emailForCheck ?? user?.email ?? DEMO_USER.email
    const safeRole = clampRole(nextRole, email)
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
      // DEMO MODE: admin only for the allowlisted email; everyone else
      // signs in as a listener.
      const nextRole = isAdminEmail(email) ? 'admin' : 'listener'
      setDemoRole(nextRole, email)
      const demoUser = { ...DEMO_USER, email: email || DEMO_USER.email, role: nextRole }
      setUser(demoUser)
      return { user: demoUser, error: null }
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
      // DEMO MODE: creating an account is the same as signing in.
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
      // DEMO MODE: Google sign-in keeps the stored demo role.
      const demoUser = { ...DEMO_USER, role: demoRole }
      setUser(demoUser)
      return { user: demoUser, error: null }
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
      signInEmail,
      signUpEmail,
      signInGoogle,
      signOut,
      setDemoRole,
      loading,
    }),
    // signIn*/signOut/setDemoRole are stable closures over state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, role, isDemo, demoRole, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export default AuthContext
