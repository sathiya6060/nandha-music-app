import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { getTrack as getFallbackTrack, tracks as fallbackTracks } from '../data/catalog.js'
import { useTrack, useTracks, findByIdOrSlug } from '../lib/supabaseCatalog.js'
import { shareOrDownloadStoryCard } from '../lib/shareCard.js'
import TrackRow from '../components/TrackRow.jsx'
import PinButton from '../components/PinButton.jsx'
import HideButton from '../components/HideButton.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { DetailLoading, DetailLoadError } from '../components/DetailStates.jsx'
import Icon from '../components/Icons.jsx'
import { usePlayer, formatTime } from '../player/PlayerContext.jsx'
import { setPageMeta, resetPageMeta } from '../lib/pageMeta.js'

/**
 * Route '/track/:id' — deep link to a single song (H1, OpenCodeReview
 * 26 Nov 2026: shared links used to be dead — /track/:id had no route
 * and the catch-all sent the visitor home). Resolves the track and
 * shows it; playback starts only when the visitor presses Play (B2:
 * the old auto-open + autoplay on direct load meant the track page
 * itself was never seen). Unknown ids show the not-found state.
 */
export default function Track() {
  const { t } = useI18n()
  const { id } = useParams()
  const player = usePlayer()
  const [shared, setShared] = useState(false)
  const [cardState, setCardState] = useState('')
  const [cardBusy, setCardBusy] = useState(false)

  // Supabase read layer first (B1); the static catalog is the sync
  // fallback so there is no loading flash and the page still works
  // offline / when Supabase is unreachable.
  const { data: sbTrack, isLoading: trackLoading, isError: trackError, refetch: refetchTrack } = useTrack(id)
  const { data: sbTracks, isLoading: tracksLoading, isError: tracksError } = useTracks()
  // M17: resolve from the already-loaded list first — on client-side
  // nav from Home the list is in hand, so the page renders at once
  // instead of flashing "No results found" while the single fetch
  // is still in flight (live repro 28 Nov 2026: 1 s flash in the
  // harness, longer in the cloud browser). The single fetch is the
  // fallback for direct loads; the static catalog is the last resort.
  // The static fallback applies while the DB is still answering
  // (the instant placeholder — no loading flash on direct loads)
  // and when the DB fetch actually failed (unreachable / error) —
  // but NOT when the DB was reached and the track is simply absent
  // (deleted). In that case the page must show Not Found (28 Nov
  // 2026: a deleted Vaazhvinil still rendered its full page from
  // the fallback catalog). A loading-only fallback cannot mask a
  // deletion: once both queries settle without error, the fallback
  // drops out and the Not Found branch below renders.
  const dbFailed = trackError || tracksError
  const dbPending = trackLoading || tracksLoading
  const track =
    findByIdOrSlug(sbTracks, id) ?? sbTrack ?? (dbFailed || dbPending ? getFallbackTrack(id) : null)
  // L20: the "more from this album" list reads this too — the
  // Supabase-only list left it empty while the catalog was loading.
  const allTracks = sbTracks || fallbackTracks

  // Per-route title + OG tags (S7): "<song> — <artist> | Nandha Music",
  // absolute og:url + the track cover. Cleanup restores site defaults.
  useEffect(() => {
    if (!track) return undefined
    const name = track.titleTa || track.titleEn || ''
    setPageMeta({
      title: `${name} — ${track.artist || 'Nandha Music'}`,
      description: `${name} — ${track.artist || 'Nandha Music'} | Nandha Music`,
      // M1: OG/social gets the original full-size cover, not the
      // 800px card variant.
      image: track.coverOg || track.cover,
      url: `/track/${track.id}`,
      type: 'music.song',
    })
    return resetPageMeta
  }, [track])

  // B2: no auto-open, no autoplay on direct load — the visitor sees
  // the track page first and presses Play. (The old effect played the
  // track and opened the full player here, so the page was never seen.)

  // M17: while either query is still in flight and nothing has
  // resolved yet, show a loading state — never the not-found state.
  if ((trackLoading || tracksLoading) && !track) {
    return <DetailLoading />
  }

  // The single fetch failed (a query error, not a 404 — fetchTrack
  // throws on one): offer a retry instead of a dead-end "No results".
  if (trackError && !track) {
    return <DetailLoadError onRetry={() => refetchTrack()} />
  }

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

  const albumTracks = allTracks.filter(
    (tr) => String(tr.albumId) === String(track.albumId) || tr.album === track.album,
  )

  function playTrack() {
    // M15: never play with an empty queue or a stale fallback object —
    // re-resolve against the loaded tracks (Supabase first) so the
    // queue and the played object carry lyrics + the fresh row.
    const fresh = allTracks.find((tr) => tr.id === track.id) || track
    const queue = allTracks.length > 0 ? allTracks : [fresh]
    player?.play?.(fresh, queue)
    player?.openPlayer?.()
  }

  async function shareCard() {
    setCardBusy(true)
    setCardState(t('share.generating'))
    try {
      const result = await shareOrDownloadStoryCard(track)
      setCardState(result === 'shared' ? t('share.shared') : t('share.downloaded'))
    } catch {
      setCardState(t('share.failed'))
    } finally {
      setCardBusy(false)
    }
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
          <img className="detail-head__cover" src={track.cover} alt={`Cover art for ${track.titleEn || track.titleTa}`} width={800} height={800} fetchPriority="high" />
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
            {/* Share-as-status card (PT-025): the 1080x1920 brand card,
                Web Share with download fallback. */}
            <button type="button" className="btn btn-ghost" onClick={shareCard} disabled={cardBusy}>
              <Icon name="share" size={16} /> {t('share.statusCard')}
            </button>
            <PinButton track={track} />
            <HideButton track={track} />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                player?.addToQueue?.(track)
                player?.setNotice?.(t('player.addedToQueue'))
              }}
            >
              <Icon name="queueAdd" size={16} /> {t('common.addToQueue')}
            </button>
          </div>
          {cardState && <p role="status" style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: '0.875rem' }}>{cardState}</p>}
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
