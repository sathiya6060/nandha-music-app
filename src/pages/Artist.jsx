import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { albums, artists, tracks } from '../data/catalog.js'
import TrackRow from '../components/TrackRow.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { getFollowedArtistIds, FOLLOWED_KEY } from './Library.jsx'
import { usePlayer } from '../player/PlayerContext.jsx'

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
  const { t } = useI18n()
  const { id } = useParams()
  const player = usePlayer()
  const artist = artists.find((a) => String(a.id) === String(id))
  const [following, setFollowing] = useState(() => (artist ? getFollowedArtistIds().has(artist.id) : false))

  useEffect(() => {
    setFollowing(artist ? getFollowedArtistIds().has(artist.id) : false)
  }, [artist])

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

  function playTop() {
    if (artistTracks.length > 0) player?.play?.(artistTracks[0], artistTracks)
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
          <p className="detail-head__meta">{t('playlists.tracks', { n: artistTracks.length })}</p>
          <div className="detail-head__actions">
            <button type="button" className="btn btn-primary" onClick={playTop} disabled={artistTracks.length === 0}>
              {t('common.playAll')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setFollowing(toggleFollow(artist.id))} aria-pressed={following}>
              {following ? t('common.liked') : t('common.like')}
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
                <Link to={`/album/${album.id}`} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
                  {album.cover ? (
                    <img className="track-card__cover" src={album.cover} alt="" loading="lazy" />
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

      {Object.keys(socials).length > 0 && (
        <section className="section" aria-label={t('epk.contact')}>
          <div className="section-head">
            <div><h2 className="section-title">{t('epk.contact')}</h2></div>
          </div>
          <ul className="link-list">
            {Object.entries(socials).map(([label, url]) => (
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
