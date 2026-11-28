// Error ring buffer (S11) — unit tests.
import { describe, it, expect, beforeEach } from 'vitest'
import { recordError, getErrors, clearErrors } from '../errors.js'

describe('error ring buffer', () => {
  beforeEach(() => clearErrors())

  it('records an error with source + message', () => {
    const entry = recordError('ErrorBoundary', new Error('boom'))
    expect(entry.source).toBe('ErrorBoundary')
    expect(entry.message).toBe('boom')
    expect(entry.at).toBeTruthy()
    expect(getErrors()).toHaveLength(1)
  })

  it('accepts plain strings and non-Error values', () => {
    recordError('window.onerror', 'script exploded')
    recordError('unhandledrejection', { reason: 42 })
    expect(getErrors()).toHaveLength(2)
    expect(getErrors()[0].message).toBe('script exploded')
  })

  it('caps the buffer at 50 entries (oldest dropped first)', () => {
    for (let i = 0; i < 55; i++) recordError('test', new Error(`e${i}`))
    const errors = getErrors()
    expect(errors).toHaveLength(50)
    expect(errors[0].message).toBe('e5')
    expect(errors[49].message).toBe('e54')
  })

  it('clearErrors empties the buffer', () => {
    recordError('test', new Error('x'))
    clearErrors()
    expect(getErrors()).toHaveLength(0)
  })

  // L11: caller extras must never overwrite the core fields.
  it('caller extras cannot overwrite at / source / message / stack', () => {
    const entry = recordError('real-source', new Error('real-message'), {
      at: 'forged',
      source: 'forged',
      message: 'forged',
      stack: 'forged',
      componentStack: 'kept-extra',
    })
    expect(entry.source).toBe('real-source')
    expect(entry.message).toBe('real-message')
    expect(entry.at).not.toBe('forged')
    expect(entry.stack).not.toBe('forged')
    expect(entry.componentStack).toBe('kept-extra') // non-core extras survive
  })

  // L11: window.nandhaErrors is a snapshot copy, never the live buffer.
  // The vitest env is node (no window), so fake one for this test only.
  it('window.nandhaErrors returns a copy a page script cannot mutate', () => {
    const fakeWindow = {}
    globalThis.window = fakeWindow
    try {
      recordError('test', new Error('snap'))
      expect(Array.isArray(fakeWindow.nandhaErrors)).toBe(true)
      expect(fakeWindow.nandhaErrors).toHaveLength(1)
      // Mutating the exposed array must not touch the live buffer.
      fakeWindow.nandhaErrors.push({ message: 'forged' })
      fakeWindow.nandhaErrors.length = 0
      expect(getErrors()).toHaveLength(1)
      expect(getErrors()[0].message).toBe('snap')
      // A fresh read sees the live buffer again (not the mutated copy).
      expect(fakeWindow.nandhaErrors).toHaveLength(1)
      // Legacy boot-time assignment must not throw (no-op setter) and
      // must not replace the buffer.
      expect(() => {
        fakeWindow.nandhaErrors = []
      }).not.toThrow()
      expect(getErrors()).toHaveLength(1)
    } finally {
      delete globalThis.window
    }
  })
})
