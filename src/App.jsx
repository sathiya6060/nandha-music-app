// Nandha Music — app shell.
// Monolith SPA: one Vite build + Supabase (BaaS) + R2 audio + Upstash cache.
// Providers: Language (i18n) → Auth → QueryClient → Player.
// Routes are code-split with React.lazy (performance budget: admin + EPK
// load only when visited). Mobile: bottom nav + mini-player above it.
// Desktop (≥1024px): left sidebar; mini-player at the very bottom.
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider, useI18n } from './lib/i18n.js'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import { PlayerProvider } from './player/PlayerContext.jsx'
import { queryClientOptions, bindQueryClient } from './lib/cache.js'
import { registerServiceWorker } from './lib/pwa.js'
import Sidebar, { BottomNav } from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import PlayerBar from './player/PlayerBar.jsx'
import MobilePlayer from './player/MobilePlayer.jsx'

// Code-split pages (default exports, so React.lazy works).
const Home = lazy(() => import('./pages/Home.jsx'))
const Discover = lazy(() => import('./pages/Discover.jsx'))
const Search = lazy(() => import('./pages/Search.jsx'))
const Library = lazy(() => import('./pages/Library.jsx'))
const Liked = lazy(() => import('./pages/Liked.jsx'))
const Playlists = lazy(() => import('./pages/Playlists.jsx'))
const PlaylistDetail = lazy(() => import('./pages/PlaylistDetail.jsx'))
const Artist = lazy(() => import('./pages/Artist.jsx'))
const Album = lazy(() => import('./pages/Album.jsx'))
const EPK = lazy(() => import('./pages/EPK.jsx'))

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
  const { t } = useI18n()
  return (
    <div className="loading-skeleton" role="status" aria-live="polite">
      <p>{t('common.loading')}</p>
    </div>
  )
}

function AppShell() {
  const location = useLocation()
  const { role } = useAuth()
  const isAdminRoute = location.pathname.startsWith('/admin')

  if (isAdminRoute) {
    return (
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
    )
  }

  return (
    <div className="app-layout">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar role={role} />
      <div className="app-main-wrap">
        <TopBar />
        <main id="main" className="main" tabIndex={-1}>
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
              <Route path="/epk" element={<EPK />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <BottomNav />
      <PlayerBar />
      <MobilePlayer />
    </div>
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
              <AppShell />
            </BrowserRouter>
          </PlayerProvider>
        </QueryClientProvider>
      </AuthProvider>
    </LanguageProvider>
  )
}
