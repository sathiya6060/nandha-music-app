import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import './player/player.css'
import './admin/admin.css'
import App from './App.jsx'
import { getRedisGuardStatus } from './lib/redisGuard.js'

// Read-only diagnostics (no writes): window.nandhaRedisGuard.getStatus()
// reports the free-tier guard state for the smoke tests / debugging.
if (typeof window !== 'undefined') {
  window.nandhaRedisGuard = { getStatus: getRedisGuardStatus }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
