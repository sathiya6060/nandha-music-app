// Auth helpers — pure functions shared by auth.jsx (provider),
// Login.jsx (error mapping) and tests. Kept in their own module
// because react(only-export-components) flags non-component exports
// from auth.jsx, and these helpers are used (and unit-tested)
// outside the provider.
//
// Admin authority (contract with migration 005 + 007, Area C-ADMIN):
// the client calls supabase.rpc('is_admin') ONCE per session and uses
// its result as the isAdmin source of truth — the DB user_roles row
// decides, not the email. If the RPC errors (e.g. migration 005 not
// applied yet), the ADMIN_EMAILS allowlist is the fallback FOR UI
// ROUTING ONLY (a console warning is logged), because RLS still
// enforces every write server-side. Blocked users
// (migration 007: profiles.blocked, via the is_blocked() RPC) cannot
// sign in and cannot restore a session.

/** The ONLY account that may access /admin. Case-insensitive. */
export const ADMIN_EMAILS = ['officialnandhamusic@gmail.com']

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase())
}

/** Email-allowlist role (fallback only — see the header contract). */
export function roleFromSupabaseUser(sbUser) {
  if (!sbUser) return 'listener'
  if (isAdminEmail(sbUser.email)) return 'admin'
  // L1: app_metadata only. user_metadata is user-writable, so it must
  // never decide a role.
  const metaRole = sbUser.app_metadata?.role
  return metaRole === 'artist' ? 'artist' : 'listener'
}

/**
 * Effective role from the session user + the is_admin() RPC result.
 * - adminRpc === true  → 'admin' (DB user_roles is the source of truth)
 * - adminRpc === false → not a DB admin; artist still comes from app_metadata
 * - adminRpc === null  → RPC pending or failed; allowlist fallback for
 *   UI routing only (writes are still enforced by RLS).
 */
export function resolveRole(sbUser, adminRpc) {
  if (adminRpc === true) return 'admin'
  if (adminRpc === false) return sbUser?.app_metadata?.role === 'artist' ? 'artist' : 'listener'
  return roleFromSupabaseUser(sbUser)
}

/**
 * Map a Supabase Auth error to a locale key (Login renders t(key)).
 * Sign-up and sign-in failures get distinct messages: "already
 * registered" must never read as a sign-in error. Returns null when
 * there is no error. Exported for tests.
 */
export function mapAuthError(error, mode = 'signin') {
  if (!error) return null
  const message = String(error.message || error || '').toLowerCase()
  const status = Number(error.status || 0)
  if (message === 'account_blocked' || message.includes('account blocked')) return 'auth.accountBlocked'
  if (message === 'config_error') return 'auth.configError'
  if (status === 429 || /too many requests|rate limit|rate_limit|over_request_limit/i.test(message)) {
    return 'auth.rateLimited'
  }
  if (/email not confirmed|email_not_confirmed|confirmation/i.test(message)) return 'auth.emailNotConfirmed'
  if (mode === 'signup') {
    if (/user already registered|already registered|already exists|user_already_exists/i.test(message)) {
      return 'auth.emailAlreadyRegistered'
    }
    if (/weak password|password.*too (short|weak)|at least 6 characters/i.test(message)) {
      return 'auth.weakPassword'
    }
    return 'auth.signUpError'
  }
  if (/invalid login credentials|invalid credentials|invalid email or password/i.test(message)) {
    return 'auth.invalidCredentials'
  }
  return 'auth.signInError'
}

/**
 * True when the user is blocked (migration 007: profiles.blocked,
 * read via the is_blocked() RPC). Falls back to a direct profiles
 * select when the RPC is not deployed yet; any failure means "not
 * blocked" — a blocked flag cannot exist before 007 is applied.
 * Exported for tests; `client` is the supabase client (or a fake).
 */
export async function checkBlockedStatus(client, userId) {
  if (!client || !userId) return false
  try {
    const { data, error } = await client.rpc('is_blocked')
    if (!error && typeof data === 'boolean') return data
  } catch {
    // RPC missing (007 not applied yet) — try the profiles read.
  }
  try {
    const { data, error } = await client
      .from('profiles')
      .select('blocked')
      .eq('id', userId)
      .maybeSingle()
    if (!error && data) return data.blocked === true
  } catch {
    // No profiles row / no blocked column — not blocked.
  }
  return false
}
