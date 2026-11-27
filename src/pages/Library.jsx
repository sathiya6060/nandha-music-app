import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { artists as fallbackArtists, tracks as fallbackTracks } from '../data/catalog.js'
import { useArtists, useTracks } from '../lib/supabaseCatalog.js'
import { getLikedIds } from '../components/TrackRow.jsx'
import { getPinnedTracks, unpinTrack } from '../lib/pwa.js'
import { getHiddenIds, unhideTrack } from '../lib/hiddenTracks.js'
import { usePlayer } from '../player/PlayerContext.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Icon from '../components/Icons.jsx'

export const USER_PLAYLISTS_KEY = 'nandha-user-playlists'
export const FOLLOWED_KEY = 'nandha-followed-artists'

export function getUserPlaylists() {
  try {
    const raw = localStorage.getItem(USER_PLAYLISTS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getFollowedArtistIds() {
  try {
    const raw = localStorage.getItem(FOLLOWED_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

/**
 * Route '/library' — demo mode, localStorage-backed.
 * User playlists, liked songs count, followed artists.
 */
export default function Library() {
  const { t, tp } = useI18n()
  const player = usePlayer()
  // Supabase read layer (B1); static catalog is the fallback.
  const { data: sbTracks } = useTracks()
  const { data: sbArtists } = useArtists()
  const allTracks = sbTracks || fallbackTracks
  const allArtists = sbArtists || fallbackArtists
  const [userPlaylists, setUserPlaylists] = useState(() => getUserPlaylists())
  const [likedCount, setLikedCount] = useState(() => getLikedIds().size)
  const [followedIds, setFollowedIds] = useState(() => getFollowedArtistIds())
  // Spotify batch (27 Nov 2026): pinned (offline) + hidden tracks.
  const [pinned, setPinned] = useState([])
  const [hiddenIds, setHiddenIds] = useState(() => getHiddenIds())

  useEffect(() => {
    let alive = true
    async function loadPinned() {
      const list = await getPinnedTracks()
      if (alive) setPinned(list)
    }
    function sync() {
      setUserPlaylists(getUserPlaylists())
      setLikedCount(getLikedIds().size)
      setFollowedIds(getFollowedArtistIds())
      setHiddenIds(getHiddenIds())
      loadPinned()
    }
    loadPinned()
    window.addEventListener('nandha-liked-changed', sync)
    window.addEventListener('nandha-followed-changed', sync)
    window.addEventListener('nandha-playlists-changed', sync)
    window.addEventListener('nandha-pinned-changed', sync)
    window.addEventListener('nandha-hidden-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      alive = false
      window.removeEventListener('nandha-liked-changed', sync)
      window.removeEventListener('nandha-followed-changed', sync)
      window.removeEventListener('nandha-playlists-changed', sync)
      window.removeEventListener('nandha-pinned-changed', sync)
      window.removeEventListener('nandha-hidden-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const likedTracks = allTracks.filter((tr) => getLikedIds().has(tr.id)).slice(0, 3)
  const followedArtists = allArtists.filter((a) => followedIds.has(a.id))
  // Pinned meta carries only {trackId, title, pinnedAt} — join the
  // catalog for cover/artist; fall back to the stored title.
  const pinnedTracks = pinned
    .map((m) => allTracks.find((tr) => String(tr.id) === String(m.trackId)) || { id: m.trackId, titleEn: m.title, titleTa: m.title, artist: '' })
  const hiddenTracks = allTracks.filter((tr) => hiddenIds.has(tr.id))
  const hasAnything = userPlaylists.length > 0 || likedCount > 0 || followedArtists.length > 0 || pinnedTracks.length > 0 || hiddenTracks.length > 0

  if (!hasAnything) {
    return (
      <div>
        <div className="page-head">
          <h1 className="page-head__title">{t('library.title')}</h1>
        </div>
        <EmptyState
          title={t('library.empty')}
          message={t('library.emptyHint')}
          action={<Link className="btn btn-primary" to="/search">{t('search.browse')}</Link>}
        />
      </div>
    )
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-head__title">{t('library.title')}</h1>
      </div>

      <section className="section" aria-label={t('liked.title')}>
        <div className="section-head">
          <div>
            <h2 className="section-title">
              {t('liked.title')}{' '}
              {/* PT-007: Liked Songs is pinned at the top of Library. */}
              <span className="pinned-badge" title={t('library.pinnedBadge')}>
                <Icon name="pin" size={14} /> {t('library.pinnedBadge')}
              </span>
            </h2>
            <p className="section-subtitle">{tp('playlists.tracks', likedCount)}</p>
          </div>
          {likedCount > 0 && <Link className="section-link" to="/liked">{t('common.seeAll')} →</Link>}
        </div>
        {likedCount === 0 ? (
          <p style={{ color: 'var(--muted)' }}>{t('liked.emptyHint')}</p>
        ) : (
          <ul className="list-stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {likedTracks.map((tr) => (
              <li key={tr.id}>
                <Link to="/liked" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                  <span style={{ display: 'block', padding: '8px', borderRadius: 12, background: 'var(--surface)' }}>
                    {tr.titleTa || tr.titleEn} — {tr.artist}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-label={t('library.pinned')}>
        <div className="section-head">
          <div>
            <h2 className="section-title">{t('library.pinned')}</h2>
            <p className="section-subtitle">{tp('playlists.tracks', pinnedTracks.length)}</p>
          </div>
        </div>
        {pinnedTracks.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>{t('library.pinnedEmpty')}</p>
        ) : (
          <ul className="list-stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {pinnedTracks.map((tr) => (
              <li key={tr.id} className="pinned-row">
                <button
                  type="button"
                  className="pinned-row__main"
                  onClick={() => player?.play?.(tr, [tr])}
                >
                  <span className="pinned-row__title">{tr.titleTa || tr.titleEn}</span>
                  {tr.artist && <span className="pinned-row__artist">{tr.artist}</span>}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => unpinTrack(tr)}
                >
                  {t('player.unpin')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {hiddenTracks.length > 0 && (
        <section className="section" aria-label={t('library.hidden')}>
          <div className="section-head">
            <div>
              <h2 className="section-title">{t('library.hidden')}</h2>
              <p className="section-subtitle">{tp('playlists.tracks', hiddenTracks.length)}</p>
            </div>
          </div>
          <ul className="list-stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {hiddenTracks.map((tr) => (
              <li key={tr.id} className="pinned-row">
                <span className="pinned-row__main">
                  <span className="pinned-row__title">{tr.titleTa || tr.titleEn}</span>
                  {tr.artist && <span className="pinned-row__artist">{tr.artist}</span>}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => unhideTrack(tr.id)}
                >
                  {t('common.unhide')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section" aria-label={t('playlists.title')}>
        <div className="section-head">
          <div>
            <h2 className="section-title">{t('playlists.title')}</h2>
            <p className="section-subtitle">{tp('playlists.tracks', userPlaylists.length)}</p>
          </div>
          <Link className="section-link" to="/playlists">{t('common.seeAll')} →</Link>
        </div>
        {userPlaylists.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>{t('playlists.empty')}</p>
        ) : (
          <div className="grid-cards">
            {userPlaylists.map((p) => (
              <article className="track-card" key={p.id}>
                <Link to={`/playlist/${p.id}`} className="card-link">
                  <span className="cover-placeholder track-card__cover" aria-hidden="true" style={{ fontSize: '3rem', aspectRatio: '1', width: '100%', height: 'auto' }}>N</span>
                  <h3 className="track-card__title">{p.title}</h3>
                  <p className="track-card__artist">{tp('playlists.tracks', (p.trackIds || []).length)}</p>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-label={t('library.followedArtists')}>
        <div className="section-head">
          <div>
            <h2 className="section-title">{t('library.followedArtists')}</h2>
          </div>
        </div>
        {followedArtists.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>{t('library.followHint')}</p>
        ) : (
          <div className="chip-row">
            {followedArtists.map((a) => (
              <Link key={a.id} className="chip" to={`/artist/${a.id}`}>{a.name}</Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
