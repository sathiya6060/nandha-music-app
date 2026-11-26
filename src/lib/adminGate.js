// Nandha Music — /admin guard decision (S10).
//
// Pure function extracted from src/admin/AdminLayout.jsx so the guard
// is unit-testable (see adminGate.test.js). The component still owns
// the rendering; this only answers "where, if anywhere, does this
// visitor get sent?"
//
//   loading            -> null    (wait: the session is still restoring)
//   signed out         -> '/login' (the unlinked login page)
//   signed in, not admin -> '/'   (home; no admin chrome ever renders)
//   admin              -> null    (allowed in)
export function getAdminRedirect({ user, isAdmin, loading }) {
  if (loading) return null
  if (!user) return '/login'
  if (!isAdmin) return '/'
  return null
}
