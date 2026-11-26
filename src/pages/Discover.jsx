import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n.js'
import { tracks } from '../data/catalog.js'
import { usePlayer } from '../player/PlayerContext.jsx'
import { isLiked, toggleLiked } from '../components/TrackRow.jsx'
import Icon, { HeartIcon } from '../components/Icons.jsx'

/**
 * Discover swipe feed — vertical full-screen hook cards.
 * Each card plays a 15–30s HOOK clip: play() from track.hookStartSec,
 * stop after hookDurationSec. The live player has no {fromDiscover}
 * option (play(track, queue) only), so this seeks after play() and
 * stops with a timer. Sample tracks (no audio) show the card with a
 * placeholder + 'Sample — full audio coming soon' and swipe past.
 * Swipe up (touch), mouse wheel, Arrow keys, or the on-screen buttons
 * move to the next song. Not in the bottom nav — opened from the
 * Discover tab on Home and the /discover route.
 */

function isPlayable(track) {
  return !!track && !track.isSample && !!(track.audio128 || track.audio320)
}

function DiscoverCard({ track, index, onPrev, onNext, isFirst, isLast }) {
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
  const lyric = (track.lyricsTa && track.lyricsTa[0]) || track.titleTa || ''
  const playable = isPlayable(track)

  const shareText = `${title} — ${track.artist || 'Nandha Music'} | Nandha Music ${window.location.origin}/discover`
  const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`

  function handlePlayPause() {
    if (!playable) return
    if (isCurrent) player?.playPause?.()
    else player?.play?.(track, [track])
  }

  return (
    <article className="discover-card" aria-label={`${title} — ${track.artist || 'Nandha Music'}`}>
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
        {!playable && (
          <p className="discover-card__sample">
            <span className="badge">{t('common.sampleAudioSoon')}</span>
          </p>
        )}
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
  const touchStartY = useRef(null)
  const lastWheelAt = useRef(0)
  const seekTimer = useRef(null)
  const stopTimer = useRef(null)

  const current = feed[index]
  const title = current ? (current.titleTa || current.titleEn || '') : ''

  const goTo = useCallback((next) => {
    setIndex(Math.max(0, Math.min(feed.length - 1, next)))
  }, [feed.length])

  // Scroll the container to the active card (snap handles most of it).
  useEffect(() => {
    const el = containerRef.current
    if (el) el.scrollTo({ top: index * el.clientHeight, behavior: 'auto' })
  }, [index])

  // Play the hook clip for the active card.
  useEffect(() => {
    const track = feed[index]
    if (!track) return
    if (!isPlayable(track)) return
    clearTimeout(seekTimer.current)
    clearTimeout(stopTimer.current)
    player?.play?.(track, feed)
    const start = track.hookStartSec || 0
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

  function handleScroll() {
    const el = containerRef.current
    if (!el || el.clientHeight === 0) return
    const next = Math.round(el.scrollTop / el.clientHeight)
    if (next !== index) setIndex(Math.max(0, Math.min(feed.length - 1, next)))
  }

  function handleWheel(e) {
    const now = Date.now()
    if (now - lastWheelAt.current < 600) return
    if (Math.abs(e.deltaY) < 30) return
    lastWheelAt.current = now
    goTo(index + (e.deltaY > 0 ? 1 : -1))
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
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY }}
        onTouchEnd={(e) => {
          if (touchStartY.current == null) return
          const dy = touchStartY.current - e.changedTouches[0].clientY
          touchStartY.current = null
          if (Math.abs(dy) > 50) goTo(index + (dy > 0 ? 1 : -1))
        }}
      >
        {feed.map((track, i) => (
          <DiscoverCard
            key={track.id}
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
