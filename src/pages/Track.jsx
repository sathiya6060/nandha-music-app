import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { getTrack, tracks } from '../data/catalog.js'
import { cachedFetch } from '../lib/redisGuard.js'
import TrackRow from '../components/TrackRow.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { usePlayer, formatTime } from '../player/PlayerContext.jsx'

/**
 * Route '/track/:id' — deep link to a single song (H1, OpenCodeReview
 * 26 Nov 2026: shared links used to be dead — /track/:id had no route
 * and the catch-all sent the visitor home). Resolves the track, shows
 * it, and auto-opens the player for it (playback is attempted; if the
 * browser blocks autoplay without a gesture the track is loaded paused
 * and the visitor taps play). Unknown ids show the not-found state.
 */
export default function Track() {
  const { t } = useI18n()
  const { id } = useParams()
  const player = usePlayer()
  const [shared, setShared] = useState(false)
  const playedForRef = useRef(null)

  // Sync value first (no loading flash), then refresh through the
  // Redis guard (high priority): memory -> localStorage -> Redis ->
  // static catalog. The guard never throws; a Redis outage keeps the
  // sync value on screen.
  const [track, setTrack] = useState(() => getTrack(id))

  useEffect(() => {
    let cancelled = false
    void cachedFetch(`track:${id}`, async () => getTrack(id), {
      ttlSeconds: 3600,
      priority: 'high',
    }).then((t) => {
      if (!cancelled && t) setTrack(t)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  // Deep link: load the track and open the player for it. Guarded by
  // track id so StrictMode's double-effect in dev doesn't restart it.
  useEffect(() => {
    if (!track || playedForRef.current === track.id) return
    playedForRef.current = track.id
    const current = player?.track
    if (!current || current.id !== track.id) {
      player?.play?.(track, tracks)
    }
    player?.openPlayer?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id])

  if (!track) {
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

  const albumTracks = tracks.filter(
    (tr) => String(tr.albumId) === String(track.albumId) || tr.album === track.album,
  )

  function playTrack() {
    player?.play?.(track, tracks)
    player?.openPlayer?.()
  }

  async function share() {
    const url = typeof window !== 'undefined' ? window.location.href : `/track/${track.id}`
    const shareData = {
      title: track.titleEn || track.titleTa,
      text: `${track.titleTa || track.titleEn} — ${track.artist} | Nandha Music`,
      url,
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }
      throw new Error('no-share')
    } catch (err) {
      if (err && err.name === 'AbortError') return
      try {
        await navigator.clipboard.writeText(url)
        setShared(true)
        player?.setNotice?.(t('player.linkCopied'))
        setTimeout(() => setShared(false), 2000)
      } catch {
        player?.setNotice?.(t('player.shareFailed'))
      }
    }
  }

  return (
    <div>
      <div className="detail-head">
        {track.cover ? (
          <img className="detail-head__cover" src={track.cover} alt={`Cover art for ${track.titleEn || track.titleTa}`} />
        ) : (
          <span className="cover-placeholder cover-placeholder--lg detail-head__cover" aria-hidden="true" style={{ fontSize: '4rem' }}>N</span>
        )}
        <div style={{ minWidth: 0 }}>
          <p className="badge" style={{ marginBottom: 8 }}>{t('common.song')}</p>
          <h1 className="detail-head__title">{track.titleTa || track.titleEn}</h1>
          {track.titleEn && track.titleTa && (
            <p className="detail-head__meta">{track.titleEn}</p>
          )}
          <p className="detail-head__meta">
            {track.artistId ? <Link to={`/artist/${track.artistId}`}>{track.artist}</Link> : (track.artist || 'Nandha Music')}
            {track.albumId ? <> · <Link to={`/album/${track.albumId}`}>{track.album}</Link></> : ''}
            {track.genre ? ` · ${track.genre}` : ''}
            {track.durationSec ? ` · ${formatTime(track.durationSec)}` : ''}
          </p>
          <div className="detail-head__actions">
            <button type="button" className="btn btn-primary" onClick={playTrack}>
              {t('common.play')}
            </button>
            <button type="button" className="btn" onClick={share}>
              {shared ? t('player.copied') : t('common.share')}
            </button>
          </div>
        </div>
      </div>

      {albumTracks.length > 1 && (
        <div className="list-stack">
          {albumTracks.map((tr, i) => (
            <TrackRow key={tr.id} track={tr} index={i} queue={albumTracks} />
          ))}
        </div>
      )}
    </div>
  )
}
