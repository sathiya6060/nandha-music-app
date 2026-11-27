// Auth — Supabase Auth only. There is no demo mode: when Supabase is
// not configured, sign-in is unavailable and the login page shows a
// configuration error (fail-closed). The admin allowlist applies in
// Supabase mode only; roles are admin / artist / listener (see
// supabase/migrations/001_schema.sql).
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'

/** The ONLY account that may access /admin. Case-insensitive. */
export const ADMIN_EMAILS = ['officialnandhamusic@gmail.com']

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase())
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
  // True when Supabase is not configured: sign-in is then unavailable
  // and the login page must say so.
  const [configError, setConfigError] = useState(false)

  useEffect(() => {
    if (isSupabaseConfigured()) {
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

    // MISCONFIGURED — no Supabase: fail closed. No silent fallback,
    // no signed-in user, no admin.
    setConfigError(true)
    setUser(null)
    setRole('listener')
    setLoading(false)
    return undefined
  }, [])

  const signInEmail = async (email, password) => {
    if (!isSupabaseConfigured()) {
      // No backend — refuse sign-in.
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
      // No backend — refuse sign-up.
      return { user: null, session: null, error: { message: 'config_error' } }
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
      // No backend — refuse sign-in.
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
      configError,
      signInEmail,
      signUpEmail,
      signInGoogle,
      signOut,
      loading,
    }),
    // signIn*/signOut are stable closures over state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, role, configError, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
