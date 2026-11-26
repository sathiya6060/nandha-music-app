import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { tracks } from '../data/catalog.js'
import { getLikedIds } from '../components/TrackRow.jsx'
import TrackRow from '../components/TrackRow.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { usePlayer } from '../player/PlayerContext.jsx'

/**
 * Route '/liked' — tracks in the localStorage liked set ('nandha-liked').
 */
export default function Liked() {
  const { t } = useI18n()
  const player = usePlayer()
  const [likedTracks, setLikedTracks] = useState(() => {
    const ids = getLikedIds()
    return tracks.filter((tr) => ids.has(tr.id))
  })

  useEffect(() => {
    function sync() {
      const ids = getLikedIds()
      setLikedTracks(tracks.filter((tr) => ids.has(tr.id)))
    }
    window.addEventListener('nandha-liked-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('nandha-liked-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  function playAll() {
    if (likedTracks.length > 0) player?.play?.(likedTracks[0], likedTracks)
  }

  if (likedTracks.length === 0) {
    return (
      <div>
        <div className="page-head">
          <h1 className="page-head__title">{t('liked.title')}</h1>
        </div>
        <EmptyState
          title={t('liked.empty')}
          message={t('liked.emptyHint')}
          action={<Link className="btn btn-primary" to="/search">{t('search.browse')}</Link>}
        />
      </div>
    )
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-head__title">{t('liked.title')}</h1>
        <p className="page-head__sub">{t('playlists.tracks', { n: likedTracks.length })}</p>
      </div>
      <div className="detail-head__actions" style={{ marginTop: 0, marginBottom: 16 }}>
        <button type="button" className="btn btn-primary" onClick={playAll}>
          {t('liked.playAll')}
        </button>
      </div>
      <div className="list-stack">
        {likedTracks.map((track, i) => (
          <TrackRow key={track.id} track={track} index={i} queue={likedTracks} />
        ))}
      </div>
    </div>
  )
}
