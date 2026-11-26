import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import './player/player.css'
import './admin/admin.css'
import App from './App.jsx'
import { getRedisGuardStatus } from './lib/redisGuard.js'
import { getCatalogSource } from './lib/supabaseCatalog.js'
import { installErrorHooks, getErrors } from './lib/errors.js'

// S11 observability: install the global error hooks once (window.onerror
// + unhandledrejection -> in-memory ring buffer, nothing leaves the
// device). window.nandhaErrors is the live buffer; getErrors() is the
// same list for code (smoke tests / debugging).
installErrorHooks()
if (typeof window !== 'undefined') {
  window.nandhaErrors = window.nandhaErrors || []
  window.nandhaErrorLog = { getErrors }
}

// Read-only diagnostics (no writes): window.nandhaRedisGuard.getStatus()
// reports the free-tier guard state for the smoke tests / debugging.
if (typeof window !== 'undefined') {
  window.nandhaRedisGuard = { getStatus: getRedisGuardStatus }
  // B1: which source served the catalog ('supabase' | 'fallback').
  window.nandhaCatalog = { getSource: getCatalogSource }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
