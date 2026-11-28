import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { usePlayer } from '../player/PlayerContext.jsx'
import { useToast } from '../lib/toast.jsx'
import { syncLike } from '../lib/userLibrary.js'
import Icon, { HeartIcon } from './Icons.jsx'

const LIKED_KEY = 'nandha-liked'

export function getLikedIds() {
  try {
    const raw = localStorage.getItem(LIKED_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

export function isLiked(trackId) {
  return getLikedIds().has(trackId)
}

export function toggleLiked(trackId) {
  const liked = getLikedIds()
  const nowLiked = !liked.has(trackId)
  if (nowLiked) liked.add(trackId)
  else liked.delete(trackId)
  try {
    localStorage.setItem(LIKED_KEY, JSON.stringify([...liked]))
  } catch {
    // storage unavailable (private mode) — like state stays in memory only
  }
  window.dispatchEvent(new CustomEvent('nandha-liked-changed', { detail: { trackId, liked: nowLiked } }))
  return nowLiked
}

export function formatDuration(totalSec) {
  const sec = Math.max(0, Math.round(totalSec || 0))
  const m = Math.floor(sec / 60)
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}

/**
 * One track in a list.
 * Props: { track, index, queue, onPlay }
 * A11y: the cover and the title are real <button>s that play the track
 * (no clickable divs — nested buttons can't live inside one big button).
 * The heart toggles a localStorage-backed liked set ('nandha-liked').
 * Player contract: usePlayer() exposes { play, playPause, isPlaying,
 * track } (the live implementation names the current track `track`;
 * `current` is accepted as a fallback).
 */
export default function TrackRow({ track, index, queue, onPlay }) {
  const { t } = useI18n()
  const player = usePlayer()
  const showToast = useToast()
  const [liked, setLiked] = useState(() => isLiked(track.id))

  useEffect(() => {
    function sync(e) {
      if (!e.detail || e.detail.trackId === track.id) setLiked(isLiked(track.id))
    }
    window.addEventListener('nandha-liked-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('nandha-liked-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [track.id])

  const current = player?.track ?? player?.current
  const rawPlaying = player?.isPlaying
  const isCurrent = !!current && current.id === track.id
  const isThisPlaying = isCurrent && (typeof rawPlaying === 'function' ? !!rawPlaying() : !!rawPlaying)

  function handlePlay() {
    // H9: the row's play button used to restart the current track —
    // when this IS the current track it toggles pause instead.
    if (isCurrent && !onPlay) {
      player?.playPause?.()
      return
    }
    if (onPlay) onPlay(track)
    player?.play?.(track, queue && queue.length ? queue : [track])
  }

  // Item 9: like feedback is a toast (the heart itself is the state);
  // the write-through syncs the like to Supabase for signed-in users.
  function handleLike() {
    const nowLiked = toggleLiked(track.id)
    setLiked(nowLiked)
    showToast?.(nowLiked ? t('toast.likedAdded') : t('toast.likedRemoved'))
    syncLike(track.id, nowLiked).catch(() => {})
  }

  // Add to queue (PT-015): the user queue plays before the context
  // continues. Feedback via the player notice (role="status").
  function handleAddToQueue() {
    player?.addToQueue?.(track)
    player?.setNotice?.(t('player.addedToQueue'))
  }

  const title = track.titleTa || track.titleEn || 'Untitled'
  const subtitle = track.titleTa && track.titleEn ? track.titleEn : track.artist

  return (
    <article
      className={`track-row${isCurrent ? ' is-current' : ''}`}
      aria-label={`${title} — ${track.artist || 'Nandha Music'}`}
    >
      <span className="track-row__index" aria-hidden="true">
        {typeof index === 'number' ? index + 1 : ''}
      </span>
      <button
        type="button"
        className="track-row__cover-btn"
        onClick={handlePlay}
        aria-label={`${t('common.play')}: ${title}`}
      >
        {track.cover ? (
          <img className="track-row__cover" src={track.cover} alt="" loading="lazy" width={800} height={800} />
        ) : (
          <span className="cover-placeholder track-row__cover" aria-hidden="true">N</span>
        )}
      </button>
      <div className="track-row__info">
        {/* M20: the title is a real /track/ link (the cover + play
            buttons still play); before this no track link existed
            anywhere in-app. */}
        <Link className="track-row__title-btn" to={`/track/${track.id}`}>
          {title}
        </Link>
        <p className="track-row__sub">{subtitle}</p>
      </div>
      <span className="track-row__album">{track.album || ''}</span>
      <div className="track-row__meta">
        <span className="track-row__duration">{formatDuration(track.durationSec)}</span>
        <button
          type="button"
          className={`track-row__like${liked ? ' is-liked' : ''}`}
          onClick={handleLike}
          aria-label={liked ? `${t('common.liked')}: ${title}` : `${t('common.like')}: ${title}`}
          aria-pressed={liked}
        >
          <HeartIcon size={20} filled={liked} />
        </button>
        <button
          type="button"
          className="track-row__queue"
          onClick={handleAddToQueue}
          aria-label={`${t('common.addToQueue')}: ${title}`}
          title={t('common.addToQueue')}
        >
          <Icon name="queueAdd" size={20} />
        </button>
        <button
          type="button"
          className="track-row__play"
          onClick={handlePlay}
          aria-label={isThisPlaying ? `${t('common.pause')}: ${title}` : `${t('common.play')}: ${title}`}
        >
          <Icon name={isThisPlaying ? 'pause' : 'play'} size={18} />
        </button>
      </div>
    </article>
  )
}
