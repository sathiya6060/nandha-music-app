import { defineConfig } from 'vitest/config'

// Minimal Vitest harness (S10, 27 Nov 2026). Node environment only —
// no jsdom, no testing-library (deliberately: the only new devDependency
// is Vitest itself). Tests cover pure, importable units: the real-only
// catalog, the guest-gate predicate, the stop-playback state contract,
// the /admin guard decision, plural i18n, page-meta URLs, and the error
// ring buffer. Live behaviour (audio actually pausing, the bar actually
// hiding, routes actually rendering) is verified headless against
// `vite preview` — see scripts/pre-deploy-check.sh + mobile-verify/.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
