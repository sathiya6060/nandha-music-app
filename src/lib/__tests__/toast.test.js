// Toast ids (L12) — Date.now() alone can collide within the same
// millisecond, so nextToastId() (src/lib/toastId.js) pairs it with a
// monotonic counter. Pure-function test: no DOM needed (node env).
import { describe, it, expect, vi } from 'vitest'
import { nextToastId } from '../toastId.js'
import { resolveToastOptions, DEFAULT_TOAST_DURATION_MS } from '../toastOptions.js'

describe('nextToastId', () => {
  it('never repeats, even when called many times in one tick', () => {
    const ids = new Set()
    for (let i = 0; i < 1000; i++) ids.add(nextToastId())
    expect(ids.size).toBe(1000)
  })

  it('ids are distinct strings with a counter suffix', () => {
    const a = nextToastId()
    const b = nextToastId()
    expect(typeof a).toBe('string')
    expect(a).not.toBe(b)
    expect(a).toMatch(/^toast-\d+-\d+$/)
    expect(b).toMatch(/^toast-\d+-\d+$/)
  })
})

// Toast action + custom duration (admin redesign). The Vitest
// harness is node-only with no jsdom/testing-library (deliberate —
// see vitest.config.js), so the render behaviour (action button
// calls onAction then dismisses; custom duration delays the
// auto-dismiss) is covered through the pure options resolver in
// src/lib/toastOptions.js that showToast() itself uses; the live
// render is verified headless against `vite preview` by the
// coordinator.
describe('resolveToastOptions', () => {
  it('defaults to 3500ms with no action when no options are given', () => {
    expect(resolveToastOptions()).toEqual({
      actionLabel: null,
      onAction: null,
      durationMs: 3500,
    })
    expect(DEFAULT_TOAST_DURATION_MS).toBe(3500)
  })

  it('keeps the default duration when options carry no duration', () => {
    expect(resolveToastOptions({}).durationMs).toBe(3500)
    expect(resolveToastOptions(null).durationMs).toBe(3500)
    expect(resolveToastOptions('undo').durationMs).toBe(3500)
  })

  it('honours a custom duration (Undo passes 8000)', () => {
    expect(resolveToastOptions({ durationMs: 8000 }).durationMs).toBe(8000)
    expect(resolveToastOptions({ durationMs: 100 }).durationMs).toBe(100)
  })

  it('falls back to 3500 for an invalid duration', () => {
    for (const bad of [0, -1, Number.NaN, Infinity, '8000', null]) {
      expect(resolveToastOptions({ durationMs: bad }).durationMs).toBe(3500)
    }
  })

  it('passes an action label + handler through', () => {
    const onAction = vi.fn()
    const resolved = resolveToastOptions({ actionLabel: 'Undo', onAction })
    expect(resolved.actionLabel).toBe('Undo')
    expect(resolved.onAction).toBe(onAction)
    expect(resolved.durationMs).toBe(3500)
  })

  it('drops an action with no usable label or handler', () => {
    expect(resolveToastOptions({ actionLabel: 'Undo' }).onAction).toBeNull()
    expect(resolveToastOptions({ actionLabel: '' }).actionLabel).toBeNull()
    expect(resolveToastOptions({ onAction: 'not a function' }).onAction).toBeNull()
    expect(resolveToastOptions({ actionLabel: 42 }).actionLabel).toBeNull()
  })

  it('combines a custom duration with an action', () => {
    const onAction = vi.fn()
    expect(
      resolveToastOptions({ actionLabel: 'Undo', onAction, durationMs: 8000 }),
    ).toEqual({ actionLabel: 'Undo', onAction, durationMs: 8000 })
  })
})
