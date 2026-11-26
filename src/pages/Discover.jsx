import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n.js'
import { tracks } from '../data/catalog.js'
import { usePlayer } from '../player/PlayerContext.jsx'
import { isLiked, toggleLiked } from '../components/TrackRow.jsx'
import Icon, { HeartIcon } from '../components/Icons.jsx'

/**
 * Discover swipe feed — vertical full-screen hook cards.
 * Each card plays a 15–30s HOOK clip: play() then seekTo(hookStartSec),
 * stop after hookDurationSec. Guests start at 0 (M4) — a hook past the
 * 5s preview limit would pause immediately and the guest would hear
 * nothing; signed-in users hear the hook as before.
 * Swipe up (touch), mouse wheel, Arrow keys, or the on-screen buttons
 * move to the next song. Not in the bottom nav — opened from the
 * Discover tab on Home and the /discover route.
 */

function isPlayable(track) {
  return !!track && !!(track.audio128 || track.audio320)
}

function DiscoverCard({ track, index, onPrev, onNext, isFirst, isLast, ref }) {
  const { t } = useI18n()
  const player = usePlayer()
  const [liked, setLiked] = useState(() => isLiked(track.id))

  useEffect(() => {
    function sync(e) {
      if (!e.detail || e.detail.trackId === track.id) setLiked(isLiked(track.id))
    }
    window.addEventListener('nandha-liked-changed', sync)
    return () => window.removeEventListener('nandha-liked-changed', sync)
  }, [track.id])

  const current = player?.track ?? player?.current
  const isCurrent = !!current && current.id === track.id
  const isPlaying = isCurrent && !!player?.isPlaying
  const title = track.titleTa || track.titleEn || 'Untitled'
  // First lyric line only. Never fall back to the title here — the
  // title-as-lyric fallback printed the same title twice on every
  // card (big lyric line + heading).
  const lyric = (track.lyricsTa && track.lyricsTa[0]) || ''
  const playable = isPlayable(track)

  const shareText = `${title} — ${track.artist || 'Nandha Music'} | Nandha Music ${window.location.origin}/discover`
  const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`

  function handlePlayPause() {
    if (!playable) return
    if (isCurrent) player?.playPause?.()
    else player?.play?.(track, [track])
  }

  return (
    <article ref={ref} className="discover-card" aria-label={`${title} — ${track.artist || 'Nandha Music'}`}>
      {track.cover ? (
        <img className="discover-card__cover" src={track.cover} alt="" loading={index === 0 ? 'eager' : 'lazy'} />
      ) : (
        <span className="cover-placeholder discover-card__cover" aria-hidden="true" style={{ fontSize: '8rem', borderRadius: 0 }}>N</span>
      )}
      <div className="discover-card__scrim" aria-hidden="true" />
      {isFirst && <p className="discover-card__hint">{t('discover.swipeHint')}</p>}
      <div className="discover-card__nav">
        <button type="button" onClick={onPrev} disabled={isFirst} aria-label={t('discover.previous')}>
          <Icon name="chevronUp" size={22} />
        </button>
        <button type="button" onClick={onNext} disabled={isLast} aria-label={t('discover.next')}>
          <Icon name="chevronDown" size={22} />
        </button>
      </div>
      <div className="discover-card__body">
        {lyric && <p className="discover-card__lyric" lang="ta">{lyric}</p>}
        <h3 className="discover-card__title">{title}</h3>
        <p className="discover-card__artist">{track.artist || 'Nandha Music'} · {track.album || ''}</p>
      </div>
      <div className="discover-card__actions">
        <button
          type="button"
          className={`discover-card__action${liked ? ' is-liked' : ''}`}
          onClick={() => setLiked(toggleLiked(track.id))}
          aria-label={liked ? `${t('common.liked')}: ${title}` : `${t('common.like')}: ${title}`}
          aria-pressed={liked}
        >
          <HeartIcon size={24} filled={liked} />
        </button>
        <a
          className="discover-card__action"
          href={waUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`${t('discover.shareWhatsApp')}: ${title}`}
          style={{ textDecoration: 'none' }}
        >
          <Icon name="share" size={22} />
        </a>
        <button
          type="button"
          className="discover-card__action"
          onClick={handlePlayPause}
          disabled={!playable}
          aria-label={isPlaying ? `${t('common.pause')}: ${title}` : `${t('common.play')}: ${title}`}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={24} />
        </button>
      </div>
    </article>
  )
}

export function DiscoverFeed({ style }) {
  const { t } = useI18n()
  const player = usePlayer()
  const feed = tracks.filter((tr) => tr.status === 'published')
  const [index, setIndex] = useState(0)
  const containerRef = useRef(null)
  const cardRefs = useRef([])
  const programmaticScrollRef = useRef(false)
  const programmaticTimerRef = useRef(null)
  const firstRunRef = useRef(true)
  const isPlayingRef = useRef(false)
  const seekTimer = useRef(null)
  const stopTimer = useRef(null)

  // Mirror isPlaying in a ref so the autoplay effect reads the live
  // value instead of the closure from the render that set the index.
  isPlayingRef.current = !!player?.isPlaying

  const current = feed[index]
  const title = current ? (current.titleTa || current.titleEn || '') : ''

  // Scroll the feed to a card AND make it the active (playing) one.
  // scrollTo by index * clientHeight was unreliable with scroll-snap
  // fighting it, so we scroll to the card's own offsetTop instead.
  const goTo = useCallback((next) => {
    const target = Math.max(0, Math.min(feed.length - 1, next))
    setIndex(target)
    const el = containerRef.current
    const card = cardRefs.current[target]
    if (el && card) {
      // Ignore scroll events from this programmatic move for ~700ms:
      // the smooth scroll passes intermediate cards, and handleScroll
      // would otherwise re-set the index (and the track) mid-flight.
      programmaticScrollRef.current = true
      clearTimeout(programmaticTimerRef.current)
      programmaticTimerRef.current = setTimeout(() => {
        programmaticScrollRef.current = false
      }, 700)
      el.scrollTo({ top: card.offsetTop, behavior: 'smooth' })
    }
  }, [feed.length])

  // Play the hook clip for the active card.
  useEffect(() => {
    const track = feed[index]
    if (!track) return
    if (!isPlayable(track)) return
    const nowPlaying = player?.track ?? player?.current
    // Never restart the track that is already playing — opening
    // Discover (or scrolling back to) the current track used to reset
    // it to 0:00.
    if (nowPlaying && nowPlaying.id === track.id) {
      firstRunRef.current = false
      return
    }
    // On first mount, never hijack playback that is already in
    // progress elsewhere in the app — navigating to Discover used to
    // cut the current song and restart card 0's hook.
    if (firstRunRef.current) {
      firstRunRef.current = false
      if (isPlayingRef.current) return
    }
    clearTimeout(seekTimer.current)
    clearTimeout(stopTimer.current)
    player?.play?.(track, feed)
    // M4: guests start at 0, not at the hook — a hook past the 5s
    // preview limit would pause immediately and the guest would hear
    // nothing. Signed-in users hear the hook as before.
    const start = player?.isGuest ? 0 : (track.hookStartSec || 0)
    const dur = track.hookDurationSec || 30
    seekTimer.current = setTimeout(() => player?.seekTo?.(start), 400)
    stopTimer.current = setTimeout(() => {
      const now = player?.track ?? player?.current
      if (now && now.id === track.id && player?.isPlaying) player?.playPause?.()
    }, 400 + dur * 1000)
    return () => {
      clearTimeout(seekTimer.current)
      clearTimeout(stopTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  // Native scrolling (touch / wheel / trackpad) drives the index through
  // scroll-snap: each card snaps to the top, and this derives the active
  // card from the scroll position. No custom wheel/touch handlers: the
  // old ones double-advanced with the native scroll and fought the snap.
  function handleScroll() {
    if (programmaticScrollRef.current) return
    const el = containerRef.current
    if (!el || el.clientHeight === 0) return
    const next = Math.round(el.scrollTop / el.clientHeight)
    if (next !== index) setIndex(Math.max(0, Math.min(feed.length - 1, next)))
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); goTo(index + 1) }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); goTo(index - 1) }
  }

  if (feed.length === 0) {
    return <p role="status">{t('common.noResults')}</p>
  }

  return (
    <div>
      <p className="sr-only" aria-live="polite">{t('discover.nowShowing', { title })}</p>
      <div
        ref={containerRef}
        className="discover-feed"
        style={style}
        tabIndex={0}
        role="region"
        aria-label={t('discover.title')}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
      >
        {feed.map((track, i) => (
          <DiscoverCard
            key={track.id}
            ref={(el) => { cardRefs.current[i] = el }}
            track={track}
            index={i}
            isFirst={i === 0}
            isLast={i === feed.length - 1}
            onPrev={() => goTo(i - 1)}
            onNext={() => goTo(i + 1)}
          />
        ))}
      </div>
    </div>
  )
}

/** Route '/discover'. */
export default function Discover() {
  const { t } = useI18n()
  return (
    <div>
      <h1 className="sr-only">{t('discover.title')}</h1>
      <p className="page-head__sub" style={{ margin: '12px 0' }}>{t('discover.subtitle')}</p>
      <DiscoverFeed />
    </div>
  )
}
