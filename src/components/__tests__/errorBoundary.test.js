// ErrorBoundary latch-reset (27 Nov 2026 — click/loading fix).
// A latched boundary used to stick forever across navigations: the URL
// changed but the "Something went wrong" fallback stayed until reload.
// componentDidUpdate now clears the latch when the parent passes a new
// resetKey (the current pathname). These tests exercise that logic
// directly — no DOM needed (node env): instantiate the class, stub
// setState, and call the lifecycle method by hand.
import { describe, it, expect } from 'vitest'
import ErrorBoundary from '../ErrorBoundary.jsx'

function latchedBoundary(resetKey) {
  const b = new ErrorBoundary({ resetKey })
  b.state = { hasError: true }
  const calls = []
  b.setState = (s) => calls.push(s)
  return { b, calls }
}

describe('ErrorBoundary', () => {
  it('getDerivedStateFromError latches the fallback', () => {
    expect(ErrorBoundary.getDerivedStateFromError(new Error('boom'))).toEqual({
      hasError: true,
    })
  })

  it('stays latched when the route has not changed', () => {
    const { b, calls } = latchedBoundary('/search')
    b.componentDidUpdate({ resetKey: '/search' })
    expect(calls).toEqual([])
    expect(b.state.hasError).toBe(true)
  })

  it('clears the latch when navigating to a new route', () => {
    const { b, calls } = latchedBoundary('/search')
    b.componentDidUpdate({ resetKey: '/library' })
    expect(calls).toEqual([{ hasError: false }])
  })

  it('does nothing on navigation while healthy (no setState)', () => {
    const b = new ErrorBoundary({ resetKey: '/search' })
    b.state = { hasError: false }
    const calls = []
    b.setState = (s) => calls.push(s)
    b.componentDidUpdate({ resetKey: '/library' })
    expect(calls).toEqual([])
  })
})
