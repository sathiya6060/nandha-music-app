// Auth — Supabase Auth when configured, otherwise DEMO MODE.
// Demo mode: role is stored in localStorage ('nandha-demo-role') and any
// email signs in; the role is inferred from the email address.
// The UI must clearly label demo mode so it is never mistaken for real auth.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'

const DEMO_ROLE_KEY = 'nandha-demo-role'
const DEMO_USER = { id: 'demo-user', email: 'demo@nandhamusic.app', name: 'Demo User' }

export const DEMO_ROLES = ['admin', 'artist', 'listener']

function roleFromEmail(email) {
  const e = String(email || '').toLowerCase()
  if (e.includes('admin')) return 'admin'
  if (e.includes('artist')) return 'artist'
  return 'listener'
}

function roleFromSupabaseUser(sbUser) {
  if (!sbUser) return 'listener'
  return (
    sbUser.app_metadata?.role ||
    sbUser.user_metadata?.role ||
    'listener'
  )
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

  // Demo-mode role persisted in localStorage.
  const [demoRole, setDemoRoleState] = useState(() => {
    try {
      return localStorage.getItem(DEMO_ROLE_KEY) || 'listener'
    } catch {
      return 'listener'
    }
  })

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      // DEMO MODE — no backend: signed-in demo user with the stored role.
      setIsDemo(true)
      setUser({ ...DEMO_USER, role: demoRole })
      setRole(demoRole)
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

  const setDemoRole = (nextRole) => {
    if (!DEMO_ROLES.includes(nextRole)) return
    try {
      localStorage.setItem(DEMO_ROLE_KEY, nextRole)
    } catch {
      // ignore storage failures — role still applies for this session
    }
    setDemoRoleState(nextRole)
    setRole(nextRole)
    setUser((u) => (u ? { ...u, role: nextRole } : { ...DEMO_USER, role: nextRole }))
  }

  const signInEmail = async (email, password) => {
    if (!isSupabaseConfigured()) {
      // DEMO MODE: accept any email; role inferred from the address.
      const nextRole = roleFromEmail(email)
      setDemoRole(nextRole)
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
