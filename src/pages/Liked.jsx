import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { tracks as fallbackTracks } from '../data/catalog.js'
import { useTracks } from '../lib/supabaseCatalog.js'
import { getLikedIds } from '../components/TrackRow.jsx'
import { pruneLikedIds } from '../lib/userLibrary.js'
import TrackRow from '../components/TrackRow.jsx'
import EmptyState, { Skeleton } from '../components/EmptyState.jsx'
import { usePlayer } from '../player/PlayerContext.jsx'

/**
 * Route '/liked' — tracks in the localStorage liked set ('nandha-liked').
 */
export default function Liked() {
  const { t, tp } = useI18n()
  const player = usePlayer()
  // Supabase read layer (B1); static catalog is the fallback.
  const { data: sbTracks, isLoading } = useTracks()
  const allTracks = sbTracks || fallbackTracks
  const [likedTracks, setLikedTracks] = useState(() => {
    const ids = getLikedIds()
    return allTracks.filter((tr) => ids.has(tr.id))
  })

  useEffect(() => {
    function sync() {
      const ids = getLikedIds()
      setLikedTracks(allTracks.filter((tr) => ids.has(tr.id)))
    }
    // #8/H11: prune liked ids with no catalog track — but ONLY once
    // the Supabase catalog has loaded. Before that, a Supabase-only
    // liked id looks orphan against the 1-track fallback and would be
    // deleted on a direct load (the direct-load vs in-app mismatch).
    if (sbTracks) pruneLikedIds(allTracks.map((tr) => tr.id))
    sync()
    window.addEventListener('nandha-liked-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('nandha-liked-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [allTracks, sbTracks])

  function playAll() {
    if (likedTracks.length > 0) player?.play?.(likedTracks[0], likedTracks)
  }

  // #8/H11: while the catalog is still loading, show a loading state —
  // the old code flashed "No liked songs" on every direct load even
  // when likes existed (they only appeared after the catalog landed).
  if (isLoading && likedTracks.length === 0) {
    return (
      <div>
        <div className="page-head">
          <h1 className="page-head__title">{t('liked.title')}</h1>
        </div>
        <p role="status" style={{ color: 'var(--muted)' }}>{t('common.loading')}</p>
        <Skeleton height={48} />
        <div style={{ marginTop: 8 }}><Skeleton height={48} /></div>
      </div>
    )
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
        <p className="page-head__sub">{tp('playlists.tracks', likedTracks.length)}</p>
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
