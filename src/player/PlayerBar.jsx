import { useEffect, useState } from 'react'
import { usePlayer, formatTime } from './PlayerContext.jsx'
import { useI18n } from '../lib/i18n.js'
import { formatSleepRemaining } from '../lib/sleepTimer.js'
import Icon from '../components/Icons.jsx'
import QueuePanel from './QueuePanel.jsx'
import SleepTimerSheet from './SleepTimerSheet.jsx'
import PreviewBanner from './PreviewBanner.jsx'
import './player.css'

function IconShuffle() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M3 6h4l10 12h4m0 0-2.5-2.5M21 18l-2.5 2.5M3 18h4l2.5-3M13.5 9 17 6h4m0 0-2.5-2.5M21 6l-2.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
    </svg>
  )
}

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  )
}

function IconNext() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M6 6.5v11l8-5.5z" fill="currentColor" />
      <rect x="16" y="6" width="2.5" height="12" rx="1" fill="currentColor" />
    </svg>
  )
}

function IconPrev() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M18 6.5v11l-8-5.5z" fill="currentColor" />
      <rect x="5.5" y="6" width="2.5" height="12" rx="1" fill="currentColor" />
    </svg>
  )
}

function IconQueue() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M4 6h16M4 11h16M4 16h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M18 15l2 2-2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function IconExpand() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M6 15l-2 2V8a2 2 0 012-2h9l-2-2M18 9l2-2v9a2 2 0 01-2 2h-9l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export default function PlayerBar() {
  const { t } = useI18n()
  const {
    track,
    isPlaying,
    currentTime,
    duration,
    volume,
    quality,
    shuffle,
    repeat,
    notice,
    previewEnded,
    previewSecondsLeft,
    playPause,
    next,
    prev,
    seekTo,
    setVolume,
    setQuality,
    toggleShuffle,
    cycleRepeat,
    openPlayer,
    stopPlayback,
    sleepTimer,
    sleepRemainingSec,
    isPlayerOpen,
  } = usePlayer()
  const [showQueue, setShowQueue] = useState(false)
  const [sleepOpen, setSleepOpen] = useState(false)

  // Close the mini-bar popovers when the full player opens. The sleep
  // sheet renders at z-index 120, ABOVE the full-player overlay
  // (z-index 100), so without this it stays visible on top of the
  // expanded player: a keyboard user can Tab past it (the sheet has no
  // focus trap) to the bar's expand button, open the full player, and
  // then one Escape both closes the sheet AND stops playback — the
  // full player's handler sees no inner panel open and falls through
  // to requestClose. (OCR review of the prod sweep, 27 Nov 2026.)
  // The queue popover sits inside the bar (z-index 95, hidden behind
  // the overlay) but its state goes stale the same way, so it closes
  // too. The full player has its own sleep/queue controls.
  useEffect(() => {
    if (isPlayerOpen) {
      setSleepOpen(false)
      setShowQueue(false)
    }
  }, [isPlayerOpen])

  // Escape closes the sleep sheet / queue popover without stopping
  // playback. (Prod sweep, 27 Nov 2026: the sleep sheet had no
  // Escape handler — in the full player Escape fell through to the
  // close handler and stopped playback.)
  useEffect(() => {
    if (!sleepOpen && !showQueue) return undefined
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      if (sleepOpen) setSleepOpen(false)
      else if (showQueue) setShowQueue(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sleepOpen, showQueue])

  if (!track) return null

  // WCAG 2.5.3 (Label in Name): the button's accessible name must
  // contain its visible text. The visible title is titleTa-first, so
  // the aria-label builds from the same strings in the same order.
  const barTitle = track.titleTa || track.titleEn
  const barArtistLine = `${track.artist || ''}${track.titleEn && track.titleTa ? ` · ${track.titleEn}` : ''}`.trim()

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="player-bar" role="region" aria-label={t('player.nowPlaying')}>
      {/* Prod sweep (27 Nov 2026 — OCR L3): the player notice and the
          guest preview banner used to share one absolute anchor above
          the bar, so a toast fired while the gate banner was up (e.g.
          "Link copied" right after the 5s gate) overlapped it. They
          now stack in one column container, notice first. */}
      {(notice || previewEnded) && (
        <div className="player-bar-popups">
          {notice && (
            <div className="player-notice" role="status">
              {notice}
            </div>
          )}
          {previewEnded && <PreviewBanner className="player-preview" />}
        </div>
      )}

      {showQueue && (
        <div className="player-bar-queue">
          <QueuePanel onClose={() => setShowQueue(false)} />
        </div>
      )}

      <SleepTimerSheet open={sleepOpen} onClose={() => setSleepOpen(false)} />

      {/* Thin progress line on top of the bar (mobile-friendly seek cue). */}
      <div
        className="player-bar-progress"
        style={{ '--progress': `${progress}%` }}
        aria-hidden="true"
      />

      <button
        type="button"
        className="player-bar-main"
        onClick={openPlayer}
        aria-label={`${t('common.openPlayer')} — ${barTitle}${barArtistLine ? ` ${barArtistLine}` : ''}`}
      >
        <span className="player-bar-cover">
          {track.cover ? (
            <img src={track.cover} alt="" loading="lazy" width={800} height={800} />
          ) : (
            <span className="player-bar-cover-fallback" aria-hidden="true">
              N
            </span>
          )}
        </span>
        <span className="player-bar-titles">
          <span className="player-bar-title">
            {track.titleTa || track.titleEn}
          </span>
          {/* Item 6 (27 Nov 2026): during a guest preview the artist
              line becomes the sign-in hint with the countdown to the
              5s gate. Same line, same height — zero layout change.
              It is a span (not a link) because this whole area is
              already a button that opens the full player, where the
              hint is a real link on the cover. */}
          {previewSecondsLeft != null ? (
            <span className="player-bar-artist player-bar-artist--hint">
              {t('player.signInHint')} · {formatTime(previewSecondsLeft)}
            </span>
          ) : (
            <span className="player-bar-artist">
              {track.artist}
              {track.titleEn && track.titleTa ? ` · ${track.titleEn}` : ''}
            </span>
          )}
        </span>
      </button>

      <div className="player-bar-controls">
        <button
          type="button"
          className={`player-icon-btn player-shuffle ${shuffle ? 'is-active' : ''}`}
          onClick={toggleShuffle}
          aria-label={t('common.shuffle')}
          aria-pressed={shuffle}
          title={t('common.shuffle')}
        >
          <IconShuffle />
        </button>

        <button
          type="button"
          className="player-icon-btn"
          onClick={prev}
          aria-label={t('common.previous')}
          title={t('common.previous')}
        >
          <IconPrev />
        </button>

        <button
          type="button"
          className="player-play-btn"
          onClick={playPause}
          aria-label={isPlaying ? t('common.pause') : t('common.play')}
          title={isPlaying ? t('common.pause') : t('common.play')}
        >
          {/* key remounts the icon on play-state change so the pop
              animation replays — the toggle reads as instant. */}
          <span key={isPlaying ? 'pause' : 'play'} className="player-play-icon">
            {isPlaying ? <IconPause /> : <IconPlay />}
          </span>
        </button>

        <button
          type="button"
          className="player-icon-btn"
          onClick={next}
          aria-label={t('common.next')}
          title={t('common.next')}
        >
          <IconNext />
        </button>

        <button
          type="button"
          className="player-icon-btn player-close"
          onClick={stopPlayback}
          aria-label={t('common.close')}
          title={t('common.close')}
        >
          <Icon name="close" size={20} />
        </button>

        <button
          type="button"
          className={`player-icon-btn player-repeat ${repeat !== 'off' ? 'is-active' : ''}`}
          onClick={cycleRepeat}
          aria-label={`${t('common.repeat')}: ${repeat}`}
          title={`${t('common.repeat')}: ${repeat}`}
        >
          <span aria-hidden="true">{repeat === 'one' ? '↻¹' : '↻'}</span>
        </button>
      </div>

      <div className="player-bar-seek">
        <span className="player-time">{formatTime(currentTime)}</span>
        <input
          type="range"
          className="player-seek"
          min="0"
          max={duration > 0 ? Math.floor(duration) : 0}
          step="1"
          value={Math.floor(currentTime)}
          onChange={(e) => seekTo(Number(e.target.value))}
          aria-label={t('common.seek')}
        />
        <span className="player-time">{formatTime(duration)}</span>
      </div>

      <div className="player-bar-side">
        <button
          type="button"
          className="player-quality-btn"
          onClick={() => setQuality(quality === '128' ? '320' : '128')}
          aria-label={`${t('common.quality')} ${quality} kbps`}
          title={t('common.quality')}
        >
          {quality}k
        </button>

        <label className="player-volume">
          <span className="sr-only">{t('common.volume')}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label={t('common.volume')}
          />
        </label>

        <button
          type="button"
          className={`player-icon-btn ${showQueue ? 'is-active' : ''}`}
          onClick={() => setShowQueue((s) => !s)}
          aria-label={t('common.queue')}
          aria-expanded={showQueue}
          title={t('common.queue')}
        >
          <IconQueue />
        </button>

        {/* Sleep timer (PT-014): opens the same sheet as the expanded
            player. Shows the remaining time while a timer is active. */}
        <button
          type="button"
          className={`player-icon-btn player-sleep-btn${sleepTimer ? ' is-active' : ''}`}
          onClick={() => setSleepOpen(true)}
          // WCAG 2.5.3: keep the accessible name in step with the visible
          // countdown badge (aria-hidden, so axe does not flag it, but a
          // screen-reader user should hear the same "4:57 left" a sighted
          // user sees).
          aria-label={
            sleepTimer?.mode === 'minutes'
              ? t('player.sleepRemaining', { time: formatSleepRemaining(sleepRemainingSec * 1000) })
              : sleepTimer
                ? t('player.sleepEndOfTrack')
                : t('player.sleepTimer')
          }
          aria-pressed={Boolean(sleepTimer)}
          title={sleepTimer ? t('player.sleepRemaining', { time: formatSleepRemaining(sleepRemainingSec * 1000) }) : t('player.sleepTimer')}
        >
          <Icon name="moon" size={20} />
          {sleepTimer && sleepTimer.mode === 'minutes' && (
            <span className="player-sleep-count" aria-hidden="true">
              {formatSleepRemaining(sleepRemainingSec * 1000)}
            </span>
          )}
        </button>

        <button
          type="button"
          className="player-icon-btn"
          onClick={openPlayer}
          aria-label={t('common.openPlayer')}
          title={t('common.openPlayer')}
        >
          <IconExpand />
        </button>
      </div>
    </div>
  )
}
