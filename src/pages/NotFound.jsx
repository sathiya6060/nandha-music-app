// Nandha Music — branded 404 page (N8, 27 Nov 2026).
//
// Unknown paths used to redirect silently to / (fine for a SPA, but
// a shared/dead link deserved a real answer). This page keeps the
// brand (Charcoal Slate bg, Warm Sand text, Amber Gold button, orange
// N logo) and links home. Deliberately free of i18n / theme deps so
// it renders even if a provider above it fails.
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { setPageMeta, resetPageMeta } from '../lib/pageMeta.js'

const PAGE_STYLE = {
  minHeight: '60dvh',
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
  borderRadius: 16,
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

export default function NotFound() {
  useEffect(() => {
    setPageMeta({
      title: 'Page not found',
      description: 'This page does not exist on Nandha Music — head home to keep listening.',
      url: '/404',
    })
    return resetPageMeta
  }, [])

  return (
    <div style={PAGE_STYLE} role="alert">
      <img src="/assets/nandha-logo.png" alt="Nandha Music" width={72} height={72} />
      <div style={{ fontSize: 20, fontWeight: 700 }}>Page not found</div>
      <div style={{ fontSize: 14, opacity: 0.85, maxWidth: 420 }}>
        This link doesn&apos;t lead anywhere on Nandha Music any more —
        it may have moved, or the address was mistyped.
      </div>
      <Link to="/" style={BUTTON_STYLE}>
        Back to Home
      </Link>
    </div>
  )
}
