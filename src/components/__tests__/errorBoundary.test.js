// ErrorBoundary latch-reset (27 Nov 2026 — click/loading fix).
// A latched boundary used to stick forever across navigations: the URL
// changed but the "Something went wrong" fallback stayed until reload.
// getDerivedStateFromProps now clears the latch when the parent passes
// a new resetKey (pathname + search + hash — App.jsx ResettableBoundary,
// M14). These tests exercise that static method directly — no DOM needed
// (node env).
import { describe, it, expect } from 'vitest'
import ErrorBoundary from '../ErrorBoundary.jsx'

const { getDerivedStateFromProps, getDerivedStateFromError } = ErrorBoundary

describe('ErrorBoundary', () => {
  it('initialises resetKey from props', () => {
    const b = new ErrorBoundary({ resetKey: '/search' })
    expect(b.state).toEqual({ hasError: false, resetKey: '/search' })
  })

  it('getDerivedStateFromError latches the fallback', () => {
    expect(getDerivedStateFromError(new Error('boom'))).toEqual({
      hasError: true,
    })
  })

  it('stays latched when the route has not changed', () => {
    expect(
      getDerivedStateFromProps(
        { resetKey: '/search' },
        { hasError: true, resetKey: '/search' },
      ),
    ).toBeNull()
  })

  it('clears the latch when navigating to a new route', () => {
    expect(
      getDerivedStateFromProps(
        { resetKey: '/library' },
        { hasError: true, resetKey: '/search' },
      ),
    ).toEqual({ hasError: false, resetKey: '/library' })
  })

  // M14: the reset key is pathname + search + hash (App.jsx
  // ResettableBoundary), so a query-only navigation resets the latch.
  it('clears the latch on a query-only navigation (same pathname)', () => {
    expect(
      getDerivedStateFromProps(
        { resetKey: '/search?q=b' },
        { hasError: true, resetKey: '/search?q=a' },
      ),
    ).toEqual({ hasError: false, resetKey: '/search?q=b' })
  })

  it('clears the latch on a hash-only navigation', () => {
    expect(
      getDerivedStateFromProps(
        { resetKey: '/search#results' },
        { hasError: true, resetKey: '/search' },
      ),
    ).toEqual({ hasError: false, resetKey: '/search#results' })
  })

  it('stays latched when pathname, query and hash are all unchanged', () => {
    expect(
      getDerivedStateFromProps(
        { resetKey: '/search?q=a' },
        { hasError: true, resetKey: '/search?q=a' },
      ),
    ).toBeNull()
  })

  it('does nothing on navigation while healthy (no state update)', () => {
    expect(
      getDerivedStateFromProps(
        { resetKey: '/library' },
        { hasError: false, resetKey: '/search' },
      ),
    ).toBeNull()
  })
})
