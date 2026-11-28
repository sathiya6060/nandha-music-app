import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { albums as fallbackAlbums, artists as fallbackArtists, tracks as fallbackTracks } from '../data/catalog.js'
import { useAlbums, useArtists, useTracks, findByIdOrSlug } from '../lib/supabaseCatalog.js'
import TrackRow from '../components/TrackRow.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { DetailLoading, DetailLoadError } from '../components/DetailStates.jsx'
import { getFollowedArtistIds, FOLLOWED_KEY } from './Library.jsx'
import { usePlayer } from '../player/PlayerContext.jsx'
import { useToast } from '../lib/toast.jsx'
import { shareLink } from '../lib/share.js'
import { syncFollow } from '../lib/userLibrary.js'
import { setPageMeta, resetPageMeta } from '../lib/pageMeta.js'

function toggleFollow(artistId) {
  const followed = getFollowedArtistIds()
  const nowFollowing = !followed.has(artistId)
  if (nowFollowing) followed.add(artistId)
  else followed.delete(artistId)
  try { localStorage.setItem(FOLLOWED_KEY, JSON.stringify([...followed])) } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('nandha-followed-changed', { detail: { artistId, following: nowFollowing } }))
  return nowFollowing
}

/**
 * Route '/artist/:id' — header (photo placeholder, name, Tamil+English
 * bio), top tracks, albums, social links, Press Kit button to /epk.
 */
export default function Artist() {
  const { t, tp } = useI18n()
  const { id } = useParams()
  const player = usePlayer()
  const showToast = useToast()
  // Supabase read layer (B1); static catalog is the fallback.
  const { data: sbArtists, isLoading: artistsLoading, isError: artistsError, refetch: refetchArtists } = useArtists()
  const { data: sbAlbums, isLoading: albumsLoading } = useAlbums()
  const { data: sbTracks, isLoading: tracksLoading } = useTracks()
  const artists = sbArtists || fallbackArtists
  const albums = sbAlbums || fallbackAlbums
  const tracks = sbTracks || fallbackTracks
  // B1/H8: the route id may be a slug ('nandha-music') or a DB uuid.
  const artist = findByIdOrSlug(artists, id)
  const [following, setFollowing] = useState(() => (artist ? getFollowedArtistIds().has(artist.id) : false))

  useEffect(() => {
    setFollowing(artist ? getFollowedArtistIds().has(artist.id) : false)
  }, [artist])

  // Per-route title + OG tags (S7). Cleanup restores site defaults.
  useEffect(() => {
    if (!artist) return undefined
    setPageMeta({
      title: artist.name,
      description: `${artist.name} — ${artist.bioEn || artist.bioTa || 'Nandha Music'} | Nandha Music`,
      image: artist.photo,
      url: `/artist/${artist.id}`,
      type: 'profile',
    })
    return resetPageMeta
  }, [artist])

  // M17: while the lists are still loading and the artist has not
  // resolved yet, show a loading state — never "No results found".
  if ((artistsLoading || albumsLoading || tracksLoading) && !artist) {
    return <DetailLoading />
  }

  if (artistsError && !artist) {
    return <DetailLoadError onRetry={() => refetchArtists()} />
  }

  if (!artist) {
    return (
      <div>
        <div className="page-head">
          <h1 className="page-head__title">{t('common.noResults')}</h1>
        </div>
        <EmptyState
          title={t('common.noResults')}
          message={t('common.tryDifferent')}
          action={<Link className="btn btn-primary" to="/">{t('nav.home')}</Link>}
        />
      </div>
    )
  }

  const artistTracks = tracks
    .filter((tr) => String(tr.artistId) === String(artist.id) || tr.artist === artist.name)
    .sort((a, b) => (b.plays || 0) - (a.plays || 0))
  const artistAlbums = albums.filter(
    (al) => String(al.artistId) === String(artist.id) || al.artist === artist.name,
  )
  const socials = artist.socials || artist.links || {}
  // L17: social links come from the DB — only https: URLs may render
  // as links (no javascript:, data: or schemeless hrefs).
  const safeSocials = Object.fromEntries(
    Object.entries(socials).filter(([, url]) => {
      try {
        return new URL(String(url)).protocol === 'https:'
      } catch {
        return false
      }
    }),
  )

  function playTop() {
    if (artistTracks.length > 0) player?.play?.(artistTracks[0], artistTracks)
  }

  // Item 9: the button says Follow/Following (not Like/Liked), with
  // toast feedback; the write-through syncs the follow to Supabase
  // for signed-in users.
  function handleFollow() {
    const nowFollowing = toggleFollow(artist.id)
    setFollowing(nowFollowing)
    showToast?.(nowFollowing ? t('toast.followed') : t('toast.unfollowed'))
    syncFollow(artist.id, nowFollowing).catch(() => {})
  }

  async function handleShare() {
    const url = typeof window !== 'undefined'
      ? `${window.location.origin}/artist/${artist.slug || artist.id}`
      : `/artist/${artist.slug || artist.id}`
    const result = await shareLink({
      title: artist.name,
      text: `${artist.name} | Nandha Music`,
      url,
    })
    if (result === 'copied') showToast?.(t('player.linkCopied'))
    else if (result === 'failed') showToast?.(t('player.shareFailed'))
    else if (result === 'shared') showToast?.(t('share.shared'))
  }

  return (
    <div>
      <div className="detail-head">
        {artist.photo ? (
          <img className="detail-head__cover" src={artist.photo} alt="" style={{ borderRadius: '50%' }} />
        ) : (
          <span className="cover-placeholder cover-placeholder--lg detail-head__cover" aria-hidden="true" style={{ fontSize: '4rem', borderRadius: '50%' }}>
            {(artist.name || 'N').trim().charAt(0)}
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          <p className="badge" style={{ marginBottom: 8 }}>{t('common.artist')}</p>
          <h1 className="detail-head__title">{artist.name}</h1>
          <p className="detail-head__meta">{tp('playlists.tracks', artistTracks.length)}</p>
          <div className="detail-head__actions">
            <button type="button" className="btn btn-primary" onClick={playTop} disabled={artistTracks.length === 0}>
              {t('common.playAll')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleFollow} aria-pressed={following}>
              {following ? t('artist.following') : t('artist.follow')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleShare}>
              {t('common.share')}
            </button>
            <Link className="btn btn-ghost" to="/epk">{t('artist.pressKit')}</Link>
          </div>
        </div>
      </div>

      {(artist.bioTa || artist.bioEn) && (
        <section className="section" aria-label={t('artist.about')}>
          <h2 className="section-title" style={{ marginBottom: 8 }}>{t('artist.about')}</h2>
          {artist.bioTa && <p lang="ta" style={{ margin: '0 0 8px' }}>{artist.bioTa}</p>}
          {artist.bioEn && <p style={{ margin: 0, color: 'var(--muted)' }}>{artist.bioEn}</p>}
        </section>
      )}

      <section className="section" aria-label={t('artist.topTracks')}>
        <div className="section-head">
          <div><h2 className="section-title">{t('artist.topTracks')}</h2></div>
        </div>
        {artistTracks.length === 0 ? (
          <EmptyState title={t('common.noResults')} message={t('home.emptyCatalog')} />
        ) : (
          <div className="list-stack">
            {artistTracks.slice(0, 10).map((track, i) => (
              <TrackRow key={track.id} track={track} index={i} queue={artistTracks} />
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-label={t('artist.albums')}>
        <div className="section-head">
          <div><h2 className="section-title">{t('artist.albums')}</h2></div>
        </div>
        {artistAlbums.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>{t('common.noResults')}</p>
        ) : (
          <div className="grid-cards">
            {artistAlbums.map((album) => (
              <article className="track-card" key={album.id}>
                <Link to={`/album/${album.slug || album.id}`} className="card-link">
                  {album.cover ? (
                    <img className="track-card__cover" src={album.cover} alt="" loading="lazy" width={800} height={800} />
                  ) : (
                    <span className="cover-placeholder track-card__cover" aria-hidden="true" style={{ fontSize: '3rem', aspectRatio: '1', width: '100%', height: 'auto' }}>N</span>
                  )}
                  <h3 className="track-card__title">{album.titleTa || album.title || album.titleEn}</h3>
                  <p className="track-card__artist">{album.releaseDate || ''}</p>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      {Object.keys(safeSocials).length > 0 && (
        <section className="section" aria-label={t('epk.contact')}>
          <div className="section-head">
            <div><h2 className="section-title">{t('epk.contact')}</h2></div>
          </div>
          <ul className="link-list">
            {Object.entries(safeSocials).map(([label, url]) => (
              <li key={label}>
                <a href={url} target="_blank" rel="noreferrer">
                  <span>{label}</span>
                  <span aria-hidden="true">↗</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
