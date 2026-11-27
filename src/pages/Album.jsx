import { Link, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import { useI18n } from '../lib/i18n.js'
import { setPageMeta, resetPageMeta } from '../lib/pageMeta.js'
import { albums as fallbackAlbums, tracks as fallbackTracks } from '../data/catalog.js'
import { useAlbums, useTracks } from '../lib/supabaseCatalog.js'
import TrackRow from '../components/TrackRow.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { usePlayer } from '../player/PlayerContext.jsx'
import { useToast } from '../lib/toast.jsx'
import { shareLink } from '../lib/share.js'

/**
 * Route '/album/:id' — album header, track list in album order, play-all.
 */
export default function Album() {
  const { t, tp } = useI18n()
  const { id } = useParams()
  const player = usePlayer()
  const showToast = useToast()
  // Supabase read layer (B1); static catalog is the fallback.
  const { data: sbAlbums } = useAlbums()
  const { data: sbTracks } = useTracks()
  const albums = sbAlbums || fallbackAlbums
  const tracks = sbTracks || fallbackTracks
  const album = albums.find((a) => String(a.id) === String(id))

  // Per-route title + OG tags (S7). Cleanup restores site defaults.
  useEffect(() => {
    if (!album) return undefined
    const name = album.titleTa || album.title || album.titleEn || ''
    setPageMeta({
      title: `${name} — ${album.artist || 'Nandha Music'}`,
      description: `${name} — ${album.artist || 'Nandha Music'} | Nandha Music`,
      // M1: OG/social gets the original full-size cover.
      image: album.coverOg || album.cover,
      url: `/album/${album.id}`,
      type: 'music.album',
    })
    return resetPageMeta
  }, [album])

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

  // Item 9: Share (Web Share API + copy-link fallback) with toast
  // feedback for the copy path.
  async function handleShare() {
    const name = album.titleTa || album.title || album.titleEn || 'Nandha Music'
    const url = typeof window !== 'undefined'
      ? `${window.location.origin}/album/${album.id}`
      : `/album/${album.id}`
    const result = await shareLink({
      title: name,
      text: `${name} — ${album.artist || 'Nandha Music'} | Nandha Music`,
      url,
    })
    if (result === 'copied') showToast?.(t('player.linkCopied'))
    else if (result === 'failed') showToast?.(t('player.shareFailed'))
    else if (result === 'shared') showToast?.(t('share.shared'))
  }

  return (
    <div>
      <div className="detail-head">
        {album.cover ? (
          <img className="detail-head__cover" src={album.cover} alt="" width={800} height={800} fetchPriority="high" />
        ) : (
          <span className="cover-placeholder cover-placeholder--lg detail-head__cover" aria-hidden="true" style={{ fontSize: '4rem' }}>N</span>
        )}
        <div style={{ minWidth: 0 }}>
          <p className="badge" style={{ marginBottom: 8 }}>{t('common.album')}</p>
          <h1 className="detail-head__title">{album.titleTa || album.title || album.titleEn}</h1>
          <p className="detail-head__meta">
            {album.artist ? <Link to={album.artistId ? `/artist/${album.artistId}` : '#'}>{album.artist}</Link> : 'Nandha Music'}
            {album.releaseDate ? ` · ${album.releaseDate}` : ''}
            {albumTracks.length ? ` · ${tp('album.tracks', albumTracks.length)}` : ''}
          </p>
          {album.description && <p style={{ color: 'var(--muted)', margin: '8px 0 0' }}>{album.description}</p>}
          <div className="detail-head__actions">
            <button type="button" className="btn btn-primary" onClick={playAll} disabled={albumTracks.length === 0}>
              {t('common.playAll')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleShare}>
              {t('common.share')}
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
