// ErrorBoundary latch-reset (27 Nov 2026 — click/loading fix).
// A latched boundary used to stick forever across navigations: the URL
// changed but the "Something went wrong" fallback stayed until reload.
// getDerivedStateFromProps now clears the latch when the parent passes
// a new resetKey (the current pathname). These tests exercise that
// static method directly — no DOM needed (node env).
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

  it('does nothing on navigation while healthy (no state update)', () => {
    expect(
      getDerivedStateFromProps(
        { resetKey: '/library' },
        { hasError: false, resetKey: '/search' },
      ),
    ).toBeNull()
  })
})
