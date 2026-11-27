// Nandha Music — ErrorBoundary (B3).
// A render error in any route, or a failed lazy-chunk load (e.g. a new
// deploy while a tab is open), used to unmount the whole tree into a
// white screen — the index.html boot guard only covers mount failure,
// not runtime errors. This boundary catches those errors and shows a
// branded fallback (same look as the boot guard) instead of a blank
// page. It is deliberately free of i18n / router / theme dependencies
// so it still renders when a provider above it fails.
//
// Error logging lives in ONE place here (componentDidCatch): the
// Phase 4 observability hook extends this method, nowhere else.
import { Component } from 'react'
import { recordError } from '../lib/errors.js'

// Brand colours (exact): Charcoal Slate #1E293B, Warm Sand #FEF3C7,
// Amber Gold #F59E0B, Pure White #FFFFFF.
const FALLBACK_STYLE = {
  minHeight: '100dvh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  background: '#1E293B',
  color: '#FEF3C7',
  fontFamily: 'system-ui, sans-serif',
  textAlign: 'center',
  padding: 24,
  boxSizing: 'border-box',
}

const BUTTON_STYLE = {
  background: '#F59E0B',
  color: '#1E293B',
  border: 0,
  borderRadius: 999,
  padding: '12px 28px',
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  minHeight: 44,
  textDecoration: 'none',
  display: 'inline-block',
  boxSizing: 'border-box',
}

const LINK_STYLE = {
  color: '#FEF3C7',
  fontSize: 14,
  opacity: 0.85,
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, resetKey: props.resetKey }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  // Navigation reset (27 Nov 2026 — click/loading fix): a latched
  // boundary used to stick forever across navigations, so the URL
  // changed but the "Something went wrong" fallback stayed until the
  // user reloaded. When the parent passes a new resetKey (the current
  // pathname) while latched, clear the latch and retry the new route.
  // Only fires while latched — healthy navigations never touch state
  // (the key syncs on the clear itself, so it is always current when
  // the next latch happens). Derived state, not componentDidUpdate,
  // so the boundary reset carries no lint warning.
  static getDerivedStateFromProps(props, state) {
    if (state.hasError && state.resetKey !== props.resetKey) {
      return { hasError: false, resetKey: props.resetKey }
    }
    return null
  }

  componentDidCatch(error, errorInfo) {
    // Single logging place for render errors — extend here for
    // Phase 4 observability (do not scatter console.error calls).
    // S11: also persist to the in-memory ring buffer (src/lib/errors.js)
    // so the last 50 errors are inspectable via window.nandhaErrors.
    // Nothing leaves the device; there is no third-party reporter.
    console.error('[ErrorBoundary] render error caught:', error, errorInfo)
    try {
      recordError('ErrorBoundary', error, {
        componentStack: errorInfo?.componentStack || undefined,
      })
    } catch {
      /* recording must never break the fallback UI */
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={FALLBACK_STYLE} role="alert">
        <div style={{ fontSize: 20, fontWeight: 700 }}>
          Something went wrong
        </div>
        <div style={{ fontSize: 14, opacity: 0.85, maxWidth: 420 }}>
          Nandha Music hit an unexpected error. Your music is safe —
          try again, or reload the page.
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" style={BUTTON_STYLE} onClick={this.handleRetry}>
            Try again
          </button>
          <button type="button" style={BUTTON_STYLE} onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
        <a href="/" style={LINK_STYLE} onClick={this.handleRetry}>
          Go to Home
        </a>
      </div>
    )
  }
}
