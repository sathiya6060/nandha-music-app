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
})
