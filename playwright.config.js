// Playwright E2E config — Nandha Music (28 Nov 2026).
// Guest flows only (no auth): home, search, track page, navigation,
// admin redirect, mini player. Runs against `vite preview` (the
// production build) so CI tests what actually ships.
// No secrets: the app falls back to the local catalog when Supabase
// env vars are absent (src/lib/supabase.js), so these tests pass both
// locally (real backend) and in CI (no env vars).
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
