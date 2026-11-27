// Nandha Music — app shell.
// Monolith SPA: one Vite build + Supabase (BaaS) + signed Supabase
// Storage audio + Upstash cache.
// Providers: Language (i18n) → Auth → QueryClient → Player.
// Routes are code-split with React.lazy (performance budget: admin + EPK
// load only when visited). Mobile: bottom nav + mini-player above it.
// Desktop (≥1024px): left sidebar; mini-player at the very bottom.
import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider, useI18n } from './lib/i18n.js'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import { PlayerProvider, usePlayer } from './player/PlayerContext.jsx'
import { queryClientOptions, bindQueryClient } from './lib/cache.js'
import { registerServiceWorker } from './lib/pwa.js'
import Sidebar, { BottomNav } from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import Footer from './components/Footer.jsx'
import ConsentBanner from './components/ConsentBanner.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { Skeleton } from './components/EmptyState.jsx'
import PlayerBar from './player/PlayerBar.jsx'
import MobilePlayer from './player/MobilePlayer.jsx'
// Search is imported eagerly (not lazy): it is the most-visited route
// from the top bar, and a lazy chunk made every search flash a bare
// "Loading…" before the page's own skeleton appeared.
import Search from './pages/Search.jsx'

// Code-split pages (default exports, so React.lazy works).
const Home = lazy(() => import('./pages/Home.jsx'))
const Discover = lazy(() => import('./pages/Discover.jsx'))
const Library = lazy(() => import('./pages/Library.jsx'))
const Liked = lazy(() => import('./pages/Liked.jsx'))
const Playlists = lazy(() => import('./pages/Playlists.jsx'))
const PlaylistDetail = lazy(() => import('./pages/PlaylistDetail.jsx'))
const Artist = lazy(() => import('./pages/Artist.jsx'))
const Album = lazy(() => import('./pages/Album.jsx'))
// Track deep link (H1): shared /track/:id URLs used to hit the catch-all
// and bounce home. The page resolves the track and opens the player.
const Track = lazy(() => import('./pages/Track.jsx'))
const MixPage = lazy(() => import('./pages/MixPage.jsx'))
const EPK = lazy(() => import('./pages/EPK.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))
// Login is unlinked in the public UI — the admin opens /login directly.
const Login = lazy(() => import('./pages/Login.jsx'))
// Legal pages (lazy — only downloaded when visited).
const Privacy = lazy(() => import('./pages/legal/Privacy.jsx'))
const Terms = lazy(() => import('./pages/legal/Terms.jsx'))
const Cookies = lazy(() => import('./pages/legal/Cookies.jsx'))
const Refund = lazy(() => import('./pages/legal/Refund.jsx'))
// Branded 404 (N8): unknown paths show this instead of bouncing home.
const NotFound = lazy(() => import('./pages/NotFound.jsx'))

// Build id baked into this bundle (written by scripts/write-version.mjs
// on every build). Compared against the live /version.json below.
import versionInfo from './version.json'
const RUNNING_BUILD_ID = versionInfo?.buildId || ''

// Admin (lazy — only downloaded when an admin opens /admin).
const AdminLayout = lazy(() => import('./admin/AdminLayout.jsx'))
const Dashboard = lazy(() => import('./admin/Dashboard.jsx'))
const TracksAdmin = lazy(() => import('./admin/TracksAdmin.jsx'))
const TrackEditor = lazy(() => import('./admin/TrackEditor.jsx'))
const AlbumsAdmin = lazy(() => import('./admin/AlbumsAdmin.jsx'))
const ArtistsAdmin = lazy(() => import('./admin/ArtistsAdmin.jsx'))
const LyricsAdmin = lazy(() => import('./admin/LyricsAdmin.jsx'))
const PlaylistsAdmin = lazy(() => import('./admin/PlaylistsAdmin.jsx'))
const UsersAdmin = lazy(() => import('./admin/UsersAdmin.jsx'))
const Analytics = lazy(() => import('./admin/Analytics.jsx'))
const SiteSettings = lazy(() => import('./admin/SiteSettings.jsx'))

const queryClient = new QueryClient(queryClientOptions)
bindQueryClient(queryClient)

function LoadingFallback() {
  // Page-shaped skeleton (Spotify batch, 27 Nov 2026 — no-flicker rule):
  // the old fallback was a bare "Loading…" line, so every lazy route
  // change flashed a one-line stub before the page's own skeleton
  // appeared (the same flash that made Search eager). These bars match
  // the standard page layout — page-head title + subtitle + list rows —
  // so the chunk swap has no layout jump.
  return (
    <div aria-live="polite">
      <div className="page-head">
        <Skeleton width="55%" height={28} />
        <div style={{ marginTop: 8 }}><Skeleton width="40%" height={16} /></div>
      </div>
      <div className="section" aria-label="loading">
        <Skeleton height={64} lines={4} />
      </div>
    </div>
  )
}

/**
 * Deploy freshness: checks whether the live site has a newer build than
 * the one this tab loaded. Runs on mount, when the tab becomes visible,
 * and every 5 minutes. Shows a slim banner + Refresh button ONLY — it
 * never auto-reloads (a reload mid-song would cut playback). The fetch
 * uses cache: 'no-store' and the service worker never caches
 * /version.json, so the check always sees the live build id.
 */
function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data?.buildId && data.buildId !== RUNNING_BUILD_ID) {
          setUpdateAvailable(true)
        }
      } catch {
        /* offline or version file not deployed yet — ignore */
      }
    }
    check()
    const interval = setInterval(check, 5 * 60 * 1000)
    function onVisible() {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return updateAvailable
}

function UpdateBanner() {
  const { t } = useI18n()
  const updateAvailable = useVersionCheck()
  if (!updateAvailable) return null
  return (
    <div className="update-banner" role="status">
      <span>{t('app.newVersion')}</span>
      <button
        type="button"
        className="update-banner__btn"
        onClick={() => window.location.reload()}
      >
        {t('app.refresh')}
      </button>
    </div>
  )
}

function AppShell() {
  const location = useLocation()
  const { role } = useAuth()
  // Mobile audit item 1: when no player is active, don't reserve the
  // mini-player share of the bottom chrome — .app-layout.no-player
  // drops --chrome-bottom to the nav alone (mobile) or 0 (desktop),
  // so the content and the consent banner sit that much higher.
  const { track } = usePlayer()
  const isAdminRoute = location.pathname.startsWith('/admin')

  if (isAdminRoute) {
    return (
      <>
        <UpdateBanner />
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="tracks" element={<TracksAdmin />} />
              <Route path="tracks/new" element={<TrackEditor />} />
              <Route path="tracks/:id/edit" element={<TrackEditor />} />
              <Route path="albums" element={<AlbumsAdmin />} />
              <Route path="artists" element={<ArtistsAdmin />} />
              <Route path="lyrics" element={<LyricsAdmin />} />
              <Route path="playlists" element={<PlaylistsAdmin />} />
              <Route path="users" element={<UsersAdmin />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="settings" element={<SiteSettings />} />
            </Route>
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
          </Suspense>
        </ErrorBoundary>
      </>
    )
  }

  return (
    <>
      <UpdateBanner />
      <div className={track ? 'app-layout' : 'app-layout no-player'}>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Sidebar role={role} />
        <div className="app-main-wrap">
          <TopBar />
          <main id="main" className="main" tabIndex={-1}>
            <ErrorBoundary>
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/discover" element={<Discover />} />
                <Route path="/search" element={<Search />} />
                <Route path="/library" element={<Library />} />
                <Route path="/liked" element={<Liked />} />
                <Route path="/playlists" element={<Playlists />} />
                <Route path="/playlist/:id" element={<PlaylistDetail />} />
                <Route path="/artist/:id" element={<Artist />} />
                <Route path="/album/:id" element={<Album />} />
                <Route path="/track/:id" element={<Track />} />
                <Route path="/mix/:id" element={<MixPage />} />
                <Route path="/epk" element={<EPK />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/login" element={<Login />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/cookies" element={<Cookies />} />
                <Route path="/refund" element={<Refund />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
            </ErrorBoundary>
          </main>
          <Footer />
        </div>
        <BottomNav />
        <PlayerBar />
        <MobilePlayer />
        <ConsentBanner />
      </div>
    </>
  )
}

export default function App() {
  useEffect(() => {
    // PWA: register the service worker in production builds only, so
    // `npm run dev` never serves a stale cached shell while developing.
    if (import.meta.env.PROD) registerServiceWorker()
  }, [])

  return (
    <LanguageProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <PlayerProvider>
            <BrowserRouter>
              {/* Top-level boundary: catches provider / router failures
                  above AppShell (the per-Suspense boundaries inside
                  AppShell catch route render + lazy-chunk failures). */}
              <ErrorBoundary>
                <AppShell />
              </ErrorBoundary>
            </BrowserRouter>
          </PlayerProvider>
        </QueryClientProvider>
      </AuthProvider>
    </LanguageProvider>
  )
}
