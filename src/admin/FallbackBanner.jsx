// Admin fallback banner (pasted-report C6) — the admin pages render
// the static catalog when Supabase reads fail, which used to look
// exactly like live data. This banner makes that visible.
//
// Why this shape: the catalog hooks (supabaseCatalog.js) never enter
// an error state — their fetchers swallow read failures and return
// the static fallback — so there is no hook error to read. The only
// signal the read layer exposes is getCatalogSource() ('supabase' |
// 'fallback'). Once the page's queries have settled, this banner
// reads it; when it says 'fallback' it runs one tiny probe query of
// its own so the banner can show the REAL error (code + message),
// not a guess. Retry re-runs the page's queries (via onRetry) and
// re-probes.
import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { getCatalogSource } from '../lib/supabaseCatalog.js'
import { useI18n } from '../lib/i18n.js'

export default function FallbackBanner({ loading, onRetry }) {
  const { t } = useI18n()
  // The probe result is versioned: the render only uses a result
  // from the CURRENT probe run, so a stale result never flashes
  // while the next probe is in flight — no setState reset in the
  // effect is needed. null = no probe result yet for this version.
  const [probe, setProbe] = useState(null) // null | { version, ok, error? }
  const [probeVersion, setProbeVersion] = useState(0)

  const showBanner = !loading && getCatalogSource() === 'fallback'
  // "Not configured" is derived during render, not probed: with no
  // Supabase client there is nothing to probe.
  const notConfigured = !isSupabaseConfigured || !supabase

  useEffect(() => {
    if (!showBanner || notConfigured) return undefined
    let cancelled = false
    const version = probeVersion
    supabase
      .from('tracks')
      .select('id')
      .limit(1)
      .then(
        ({ error }) => {
          if (!cancelled) {
            setProbe(error ? { version, ok: false, error } : { version, ok: true })
          }
        },
        (err) => {
          if (!cancelled) setProbe({ version, ok: false, error: err })
        },
      )
    return () => {
      cancelled = true
    }
  }, [showBanner, probeVersion, notConfigured])

  if (!showBanner) return null

  const currentProbe = probe?.version === probeVersion ? probe : null
  let message = t('admin.fallbackEmpty')
  if (notConfigured) {
    message = t('admin.fallbackNotConfigured')
  } else if (currentProbe?.error) {
    const detail = currentProbe.error.message || currentProbe.error.code || String(currentProbe.error)
    message = `${t('admin.fallbackBanner')} — ${detail}`
  } else if (currentProbe && !currentProbe.ok) {
    message = t('admin.fallbackBanner')
  }

  const handleRetry = () => {
    if (onRetry) onRetry()
    setProbeVersion((v) => v + 1)
  }

  return (
    <div className="admin-notice admin-notice-warn" role="alert" aria-live="polite">
      {message}
      {currentProbe !== null && (
        <button
          type="button"
          className="admin-btn admin-btn-small"
          onClick={handleRetry}
          style={{ marginLeft: 12 }}
        >
          {t('admin.fallbackRetry')}
        </button>
      )}
    </div>
  )
}
