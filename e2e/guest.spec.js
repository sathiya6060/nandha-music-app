// E2E — guest flows (no sign-in). Nandha Music, 28 Nov 2026.
// These tests must pass in two environments:
//  - local: real Supabase backend (.env present), 3 live tracks.
//  - CI: no env vars, local-catalog fallback (1 track), no audio file.
// So they assert UI/navigation only — never audio playback, never a
// track count, never a backend value.
import { test, expect } from '@playwright/test'

const TRACK_TA = 'வாழ்வினில் ஒருமுறையேனும்'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // Dismiss the cookie banner so it never covers the mini player.
  const accept = page.getByRole('button', { name: 'Accept' })
  if (await accept.isVisible()) await accept.click()
})

test('home loads with the real track', async ({ page }) => {
  // Track cards show the Tamil title; the English title is only on the
  // Song-of-the-Day card, whose pick changes daily — do not assert it.
  // Long timeout: the Home feed fetches the backend first and falls back
  // to the local catalog, which is slow behind the dev egress proxy.
  await expect(page.getByText(TRACK_TA).first()).toBeVisible({ timeout: 30000 })
})

test('search finds the track', async ({ page }) => {
  await page.goto('/search')
  // Two search inputs exist (header + main) — use the main one.
  await page.locator('#main input[type="search"]').fill('Vaazhvinil')
  await expect(page.getByText(TRACK_TA).first()).toBeVisible()
})

test('track page renders', async ({ page }) => {
  await page.goto('/track/vaazhvinil-orumurayenum')
  await expect(page.getByText(TRACK_TA).first()).toBeVisible()
})

test('library, liked and discover pages load', async ({ page }) => {
  await page.goto('/library')
  await expect(page.getByRole('heading', { name: 'Your Library' })).toBeVisible()
  await page.goto('/liked')
  await expect(page.getByRole('heading', { name: 'Liked Songs' })).toBeVisible()
  await page.goto('/discover')
  await expect(page).toHaveURL(/\/discover$/)
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible()
})

test('admin redirects to login when signed out', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('input[type="email"]')).toBeVisible()
})

test('clicking a track opens the mini player', async ({ page }) => {
  // The track card play button carries the Tamil title in its label.
  await page.getByRole('button', { name: TRACK_TA }).first().click()
  const bar = page.locator('.player-bar')
  await expect(bar).toBeVisible()
  await expect(bar.getByText(TRACK_TA)).toBeVisible()
})
