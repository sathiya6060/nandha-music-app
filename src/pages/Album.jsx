import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { albums, tracks } from '../data/catalog.js'
import TrackRow from '../components/TrackRow.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { usePlayer } from '../player/PlayerContext.jsx'

/**
 * Route '/album/:id' — album header, track list in album order, play-all.
 */
export default function Album() {
  const { t } = useI18n()
  const { id } = useParams()
  const player = usePlayer()
  const album = albums.find((a) => String(a.id) === String(id))

  if (!album) {
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

  const albumTracks = tracks
    .filter((tr) => String(tr.albumId) === String(album.id) || tr.album === (album.titleTa || album.title || album.titleEn))
    .sort((a, b) => (a.trackNo || 0) - (b.trackNo || 0))

  function playAll() {
    if (albumTracks.length > 0) player?.play?.(albumTracks[0], albumTracks)
  }

  return (
    <div>
      <div className="detail-head">
        {album.cover ? (
          <img className="detail-head__cover" src={album.cover} alt="" />
        ) : (
          <span className="cover-placeholder cover-placeholder--lg detail-head__cover" aria-hidden="true" style={{ fontSize: '4rem' }}>N</span>
        )}
        <div style={{ minWidth: 0 }}>
          <p className="badge" style={{ marginBottom: 8 }}>{t('common.album')}</p>
          <h1 className="detail-head__title">{album.titleTa || album.title || album.titleEn}</h1>
          <p className="detail-head__meta">
            {album.artist ? <Link to={album.artistId ? `/artist/${album.artistId}` : '#'}>{album.artist}</Link> : 'Nandha Music'}
            {album.releaseDate ? ` · ${album.releaseDate}` : ''}
            {albumTracks.length ? ` · ${t('album.tracks', { n: albumTracks.length })}` : ''}
          </p>
          {album.description && <p style={{ color: 'var(--muted)', margin: '8px 0 0' }}>{album.description}</p>}
          <div className="detail-head__actions">
            <button type="button" className="btn btn-primary" onClick={playAll} disabled={albumTracks.length === 0}>
              {t('common.playAll')}
            </button>
          </div>
        </div>
      </div>

      {albumTracks.length === 0 ? (
        <EmptyState
          title={t('common.noResults')}
          message={t('home.emptyCatalog')}
          action={<Link className="btn btn-primary" to="/search">{t('search.browse')}</Link>}
        />
      ) : (
        <div className="list-stack">
          {albumTracks.map((track, i) => (
            <TrackRow key={track.id} track={track} index={i} queue={albumTracks} />
          ))}
        </div>
      )}
    </div>
  )
}
