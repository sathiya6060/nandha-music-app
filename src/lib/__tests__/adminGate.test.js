// /admin guard decision (S10 smoke test).
//
// AdminLayout renders <Navigate> from getAdminRedirect()
// (src/lib/adminGate.js): signed out -> /login, signed in but not
// admin -> /, admin (or still loading) -> stay. The live half (the
// route actually landing on /login) is verified headless against
// vite preview.
import { describe, it, expect } from 'vitest'
import { getAdminRedirect } from '../adminGate.js'

describe('/admin guard', () => {
  it('sends a signed-out visitor to /login', () => {
    expect(
      getAdminRedirect({ user: null, isAdmin: false, loading: false }),
    ).toBe('/login')
  })

  it('sends a signed-in non-admin home', () => {
    expect(
      getAdminRedirect({
        user: { email: 'fan@example.com' },
        isAdmin: false,
        loading: false,
      }),
    ).toBe('/')
  })

  it('lets the allowlisted admin in', () => {
    expect(
      getAdminRedirect({
        user: { email: 'officialnandhamusic@gmail.com' },
        isAdmin: true,
        loading: false,
      }),
    ).toBeNull()
  })

  it('waits while the session is still restoring (no redirect yet)', () => {
    expect(
      getAdminRedirect({ user: null, isAdmin: false, loading: true }),
    ).toBeNull()
  })
})
