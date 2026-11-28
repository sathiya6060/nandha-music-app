// Auth — Supabase Auth only. There is no demo mode: when Supabase is
// not configured, sign-in is unavailable and the login page shows a
// configuration error (fail-closed).
//
// Admin authority (contract with migration 005 + 007, Area C-ADMIN):
// the client calls supabase.rpc('is_admin') ONCE per session and uses
// its result as the isAdmin source of truth — the DB user_roles row
// decides, not the email. If the RPC errors (e.g. migration 005 not
// applied yet), the ADMIN_EMAILS allowlist is the fallback FOR UI
// ROUTING ONLY (a console warning is logged), because RLS still
// enforces every write server-side. Blocked users
// (migration 007: profiles.blocked, via the is_blocked() RPC) cannot
// sign in and cannot restore a session — they are signed out at once
// and the Login page shows the blocked message.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import {
  checkBlockedStatus,
  resolveRole,
} from './authHelpers.js'

// The pure auth helpers (ADMIN_EMAILS, roleFromSupabaseUser,
// resolveRole, mapAuthError, checkBlockedStatus) live in
// authHelpers.js — auth.jsx only exports the provider + hook, so
// react(only-export-components) stays quiet. Login.jsx imports
// ADMIN_EMAILS / mapAuthError from authHelpers.js directly.

/** Call the is_admin() RPC once; null on any failure (allowlist fallback). */
async function checkAdminRpc(client) {
  try {
    const { data, error } = await client.rpc('is_admin')
    if (error) throw error
    return typeof data === 'boolean' ? data : null
  } catch (err) {
    console.warn(
      '[auth] is_admin RPC failed — using the email allowlist for UI routing only '
        + '(writes are still enforced by RLS):',
      err?.message || err,
    )
    return null
  }
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
  // True when the last sign-in / session restore was refused because
  // the account is blocked — the Login page shows the blocked message.
  const [blocked, setBlocked] = useState(false)
  // is_admin() RPC result for the current session (null = pending or
  // unavailable — the allowlist decides UI routing until it resolves).
  const [adminRpc, setAdminRpc] = useState(null)
  const adminRpcForUserRef = useRef(null)

  // Resolve the admin RPC once for this session's user (guarded by
  // the ref, so re-renders and repeat auth events never re-call it).
  const resolveAdminOnce = (sbUser) => {
    if (!sbUser || adminRpcForUserRef.current === sbUser.id) return
    adminRpcForUserRef.current = sbUser.id
    void checkAdminRpc(supabase).then((rpc) => {
      if (adminRpcForUserRef.current === sbUser.id) {
        setAdminRpc(rpc)
        setRole(resolveRole(sbUser, rpc))
      }
    })
  }

  // Apply a session user: enforce `blocked` first, then the admin RPC.
  const applySessionUser = async (sbUser) => {
    if (!sbUser) {
      setUser(null)
      setRole('listener')
      setAdminRpc(null)
      adminRpcForUserRef.current = null
      setBlocked(false)
      return
    }
    if (await checkBlockedStatus(supabase, sbUser.id)) {
      // Blocked: sign out at once and refuse the session.
      try {
        await supabase.auth.signOut()
      } catch {
        // Already signed out — the local state below is what matters.
      }
      setUser(null)
      setRole('listener')
      setAdminRpc(null)
      adminRpcForUserRef.current = null
      setBlocked(true)
      return
    }
    setBlocked(false)
    setUser(sbUser)
    setRole(resolveRole(sbUser, null))
    resolveAdminOnce(sbUser)
  }

  useEffect(() => {
    if (isSupabaseConfigured()) {
      setConfigError(false)
      let mounted = true
      // 28 Nov 2026 — deep-link race (admin editor direct-load bounce):
      // loading used to clear BEFORE the session user was applied —
      // applySessionUser awaits the blocked check, so a full load of a
      // deep /admin URL saw loading=false + user=null, the admin gate
      // sent /login, and Login bounced the signed-in admin to /admin.
      // The editor (and every deep admin URL) only worked via in-app
      // navigation. Apply the session FIRST, then clear loading — the
      // gate never sees a half-ready state. A failed restore still
      // clears loading (fail closed: user stays null → /login, which
      // is correct there). Role is already the allowlist value by then
      // (resolveRole(sbUser, null) → 'admin' for the admin email), so
      // the gate passes as soon as loading clears.
      const settleSession = async (sbUser) => {
        try {
          await applySessionUser(sbUser || null)
        } catch {
          // Restore failed — user stays null, gate sends /login.
        } finally {
          if (mounted) setLoading(false)
        }
      }
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (!mounted) return
          void settleSession(data?.session?.user)
        })
        .catch(() => {
          if (mounted) setLoading(false)
        })

      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        void settleSession(session?.user)
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
    // applySessionUser only uses state setters + a ref (both stable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signInEmail = async (email, password) => {
    if (!isSupabaseConfigured()) {
      // No backend — refuse sign-in.
      return { user: null, error: { message: 'config_error' } }
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data?.user) {
      return { user: null, error: error || { message: 'Invalid login credentials' } }
    }
    if (await checkBlockedStatus(supabase, data.user.id)) {
      try {
        await supabase.auth.signOut()
      } catch {
        // Ignore — the local state below refuses the sign-in.
      }
      setUser(null)
      setRole('listener')
      setBlocked(true)
      return { user: null, error: { message: 'account_blocked' } }
    }
    setBlocked(false)
    setUser(data.user)
    setRole(resolveRole(data.user, null))
    resolveAdminOnce(data.user)
    return { user: data.user, error: null }
  }

  const signUpEmail = async (email, password) => {
    if (!isSupabaseConfigured()) {
      // No backend — refuse sign-up.
      return { user: null, session: null, error: { message: 'config_error' } }
    }
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (!error && data?.user) {
      setUser(data.user)
      setRole(resolveRole(data.user, null))
      // Only resolve the admin RPC once a real session exists — a
      // confirmation-pending sign-up has no session yet, and its RPC
      // answer (false) must not stick for the later sign-in.
      if (data.session) resolveAdminOnce(data.user)
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
      setAdminRpc(null)
      adminRpcForUserRef.current = null
      setBlocked(false)
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
      // True when the account is blocked (migration 007). The Login
      // page reads this after a refused session restore.
      blocked,
      // Which source decided the current role: 'rpc' once is_admin()
      // answered, 'allowlist' while it is pending or unavailable.
      adminSource: adminRpc === null ? 'allowlist' : 'rpc',
      // True when Supabase reports the session email as confirmed
      // (null when confirmation is disabled or not applicable).
      emailConfirmed: user ? Boolean(user.email_confirmed_at) : null,
      signInEmail,
      signUpEmail,
      signInGoogle,
      signOut,
      loading,
    }),
    // signIn*/signOut are stable closures over state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, role, configError, loading, blocked, adminRpc],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
