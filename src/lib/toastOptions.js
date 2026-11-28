// Toast options (admin redesign, Undo use-case) — pure helpers for
// src/lib/toast.jsx, kept in their own module like toastId.js so the
// node-only Vitest harness can test them with no DOM.

/** Default auto-dismiss delay (ms) when no duration is given. */
export const DEFAULT_TOAST_DURATION_MS = 3500

/**
 * Pure resolver for showToast() options. Keeps the timer/action
 * contract unit-testable — no DOM needed.
 *
 * @param {object} [options]
 * @param {string} [options.actionLabel] — when present, an action
 *   button is rendered next to the message.
 * @param {Function} [options.onAction] — called when the action
 *   button is tapped, then the toast dismisses.
 * @param {number} [options.durationMs] — auto-dismiss delay; any
 *   non-finite / non-positive value falls back to the default.
 * @returns {{ actionLabel: string|null, onAction: Function|null, durationMs: number }}
 */
export function resolveToastOptions(options) {
  const opts = options && typeof options === 'object' ? options : {}
  const durationMs =
    Number.isFinite(opts.durationMs) && opts.durationMs > 0
      ? opts.durationMs
      : DEFAULT_TOAST_DURATION_MS
  return {
    actionLabel: typeof opts.actionLabel === 'string' && opts.actionLabel ? opts.actionLabel : null,
    onAction: typeof opts.onAction === 'function' ? opts.onAction : null,
    durationMs,
  }
}
