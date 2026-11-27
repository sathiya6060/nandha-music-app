import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlayer, formatTime } from './PlayerContext.jsx'
import { useI18n } from '../lib/i18n.js'
import { shareOrDownloadStoryCard } from '../lib/shareCard.js'
import { formatSleepRemaining } from '../lib/sleepTimer.js'
import Logo from '../components/Logo.jsx'
import Icon from '../components/Icons.jsx'
import PinButton from '../components/PinButton.jsx'
import HideButton from '../components/HideButton.jsx'
import LyricsPanel from './LyricsPanel.jsx'
import QueuePanel from './QueuePanel.jsx'
import SleepTimerSheet from './SleepTimerSheet.jsx'
import StoryCard from './StoryCard.jsx'
import './player.css'

// v1 player features in this file:
// - Canvas loop: slow Ken-Burns zoom/pan over the cover with a warm
//   dark-blue + Amber Gold gradient overlay (CSS animation, no video file),
//   with a "Canvas" toggle to pause the motion. Respects
//   prefers-reduced-motion (static cover).
// - About the Song: a "Story" button (or swipe up) reveals a story card.
// - Swipe-to-skip: horizontal swipe left = next, right = previous;
//   swipe up opens the story, swipe down closes the card / lyrics view,
//   and stops playback when nothing is open (L2: stop means stop).
//   Swipes are ignored when they start on sliders or buttons, and
//   vertical swipes only act when the sheet is scrolled to the top so they
//   never fight normal scrolling.
// - Lyrics view: the "Lyrics" button switches between cover view and
//   lyrics view. On mobile the lyrics stack below the controls (cover
//   hidden); on tablet/desktop (>= 1024px) they sit in a side panel beside
//   the player (see player.css).

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
    </svg>
  )
}

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  )
}

function IconNext() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path d="M6 6.5v11l8-5.5z" fill="currentColor" />
      <rect x="16" y="6" width="2.5" height="12" rx="1" fill="currentColor" />
    </svg>
  )
}

function IconPrev() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path d="M18 6.5v11l-8-5.5z" fill="currentColor" />
      <rect x="5.5" y="6" width="2.5" height="12" rx="1" fill="currentColor" />
    </svg>
  )
}

function IconShare() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="6" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="5.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="18.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8.2 10.8l7.6-4M8.2 13.2l7.6 4" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function IconShuffle() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function IconVolumeLow() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16.5 8.5a5 5 0 010 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function IconVolumeHigh() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function IconCanvasPause() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  )
}

function IconCanvasPlay() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
    </svg>
  )
}

const SWIPE_THRESHOLD_PX = 60

export default function MobilePlayer() {
  const {
    track,
    isPlaying,
    currentTime,
    duration,
    volume,
    quality,
    shuffle,
    repeat,
    isPlayerOpen,
    notice,
    previewEnded,
    playPause,
    next,
    prev,
    seekTo,
    setVolume,
    setQuality,
    toggleShuffle,
    cycleRepeat,
    stopPlayback,
    dismissPreviewPrompt,
    setNotice,
    sleepTimer,
    sleepRemainingSec,
  } = usePlayer()
  const { t } = useI18n()

  const [panel, setPanel] = useState(null) // null | 'queue' | 'story'
  const [view, setView] = useState('cover') // 'cover' | 'lyrics'
  const [shared, setShared] = useState(false)
  const [sleepOpen, setSleepOpen] = useState(false)
  const [cardBusy, setCardBusy] = useState(false)
  // Canvas motion on by default, unless the user prefers reduced motion.
  const [canvasOn, setCanvasOn] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  const touchRef = useRef(null)
  const sheetRef = useRef(null)
  const closeBtnRef = useRef(null)
  const prevFocusRef = useRef(null)
  const [closing, setClosing] = useState(false)
  // M1: pending close-teardown timer. A Next/Prev/Play tap during the
  // 240ms slide-down changes the track — the effect below clears this
  // timer so the stale stop cannot kill the new track.
  const closeTimerRef = useRef(null)

  // Choreographed close (Emil): the sheet used to vanish the instant
  // X / Escape / swipe-down fired. requestClose pauses the audio NOW
  // (stop means stop — the user's rule), plays the 240ms slide-down,
  // and only then runs the full stopPlayback teardown. Reduced-motion
  // users get the instant stop with no exit animation at all.
  const requestClose = useCallback(() => {
    if (closing) return
    if (isPlaying) playPause()
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      stopPlayback()
      return
    }
    setClosing(true)
    clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => stopPlayback(), 240)
  }, [closing, isPlaying, playPause, stopPlayback])

  // Close inner panels and reset the view when the track changes.
  // Also clears any pending close teardown (M1): a track change inside
  // the 240ms slide-down means the user kept listening — the stale
  // stopPlayback must not fire.
  useEffect(() => {
    clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
    setPanel(null)
    setView('cover')
    setClosing(false)
  }, [track?.id])

  // Never let a pending close teardown outlive the sheet.
  useEffect(() => () => {
    clearTimeout(closeTimerRef.current)
  }, [])

  // Lock body scroll while the full-screen player is open.
  useEffect(() => {
    if (!isPlayerOpen) return undefined
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [isPlayerOpen])

  // Escape closes the story card, then the lyrics view, then STOPS
  // playback (L2: stop means stop — the X, Escape and swipe-down all
  // stop; only the inner panels collapse without stopping). The final
  // step goes through requestClose so the sheet slides down instead
  // of vanishing (audio is paused instantly inside requestClose).
  useEffect(() => {
    if (!isPlayerOpen) return undefined
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      if (panel) setPanel(null)
      else if (view === 'lyrics') setView('cover')
      else requestClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isPlayerOpen, panel, view, requestClose])

  // L5: focus trap — when the player opens, focus the close button and
  // remember where focus was; restore it on close so Tab never leaves
  // the sheet while it is open.
  useEffect(() => {
    if (!isPlayerOpen) return undefined
    prevFocusRef.current = document.activeElement
    closeBtnRef.current?.focus()
    return () => {
      const prev = prevFocusRef.current
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        prev.focus()
      }
    }
  }, [isPlayerOpen])

  // L5: keep Tab cycling inside the dialog while it is open.
  const onDialogKeyDown = (e) => {
    if (e.key !== 'Tab' || !sheetRef.current) return
    const focusables = [...sheetRef.current.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((el) => el.getClientRects().length > 0)
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  if (!isPlayerOpen || !track) return null

  const composer = track.composer || 'Siddha Guruji'
  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/track/${track.id}`
      : `/track/${track.id}`

  const isInteractiveTarget = (target) =>
    Boolean(
      target &&
        target.closest &&
        target.closest('input, button, select, textarea, a, [data-no-swipe]'),
    )

  const onTouchStart = (e) => {
    if (e.touches.length > 1) {
      touchRef.current = null
      return
    }
    const touch = e.touches[0]
    touchRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      interactive: isInteractiveTarget(e.target),
    }
  }

  const onTouchEnd = (e) => {
    const start = touchRef.current
    touchRef.current = null
    if (!start || start.interactive) return
    const touch = e.changedTouches[0]
    if (!touch) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    const atTop = !sheetRef.current || sheetRef.current.scrollTop <= 0

    // Horizontal swipe: left = next track, right = previous track.
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD_PX) {
      if (dx < 0) next()
      else prev()
      return
    }

    // Vertical swipes only act when the sheet is at the top, so they never
    // fight normal scrolling through the player content.
    if (atTop && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SWIPE_THRESHOLD_PX) {
      if (dy < 0) {
        setPanel('story') // swipe up opens About the Song
      } else if (panel) {
        setPanel(null) // swipe down closes the open card first
      } else if (view === 'lyrics') {
        setView('cover') // swipe down leaves the lyrics view
      } else {
        requestClose() // swipe down stops playback (L2: stop means stop)
      }
    }
  }

  const share = async () => {
    const shareData = {
      title: track.titleEn || track.titleTa,
      text: `${track.titleTa || track.titleEn} — ${track.artist} | Nandha Music`,
      url: shareUrl,
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }
      throw new Error('no-share')
    } catch (err) {
      // User cancelled the share sheet — not an error. Anything else:
      // fall back to the clipboard.
      if (err && err.name === 'AbortError') return
      try {
        await navigator.clipboard.writeText(shareUrl)
        setShared(true)
        setNotice(t('player.linkCopied'))
        setTimeout(() => setShared(false), 2000)
      } catch {
        setNotice(t('player.shareFailed'))
      }
    }
  }

  // Share-as-status card (PT-025): the 1080x1920 brand card, Web Share
  // with download fallback. Feedback goes through the player notice.
  const shareCard = async () => {
    if (cardBusy) return
    setCardBusy(true)
    setNotice(t('share.generating'))
    try {
      const result = await shareOrDownloadStoryCard(track)
      setNotice(result === 'shared' ? t('share.shared') : t('share.downloaded'))
    } catch {
      setNotice(t('share.failed'))
    } finally {
      setCardBusy(false)
    }
  }

  return (
    <div
      className={`mobile-player-overlay${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${t('player.nowPlaying')}: ${track.titleTa || track.titleEn}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onKeyDown={onDialogKeyDown}
    >
      <div
        className={`mobile-player${view === 'lyrics' ? ' is-lyrics-view' : ''}${closing ? ' is-closing' : ''}`}
        ref={sheetRef}
      >
        <div className="mobile-player-main">
          <div className="mobile-player-grabber" aria-hidden="true" />
          <div className="mobile-player-topbar">
            <button
              type="button"
              className="mobile-player-close"
              ref={closeBtnRef}
              onClick={requestClose}
              aria-label={t('common.close')}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
            <span className="mobile-player-eyebrow">
              {track.album || 'Nandha Music'}
            </span>
            <span className="mobile-player-topbar-spacer" aria-hidden="true">
              <Logo size={32} />
            </span>
          </div>

          {notice && (
            <div className="player-notice mobile-player-notice" role="status">
              {notice}
            </div>
          )}

          {previewEnded && (
            <div className="player-preview mobile-player-preview" role="status">
              <span>{t('player.previewEnded')}</span>
              <Link className="player-preview__btn" to="/login">
                {t('player.signInToListen')}
              </Link>
              <button type="button" className="player-preview__dismiss" onClick={dismissPreviewPrompt}>
                {t('player.dismissPreview')}
              </button>
            </div>
          )}

          {/* Canvas loop: slow Ken-Burns zoom/pan over the cover with a warm
              dark-blue + Amber Gold gradient overlay. Pure CSS animation —
              no video file. Paused via the Canvas toggle or
              prefers-reduced-motion. */}
          <div className="mobile-player-canvas-wrap">
            <div
              className={`mobile-player-canvas${canvasOn ? ' is-animating' : ''}`}
            >
              {track.cover ? (
                <img
                  className="mobile-player-canvas-img"
                  src={track.cover}
                  alt={`Cover art for ${track.titleEn || track.titleTa}`}
                  width={800}
                  height={800}
                />
              ) : (
                <span className="mobile-player-cover-fallback" aria-hidden="true">N</span>
              )}
              <span className="mobile-player-canvas-overlay" aria-hidden="true" />
            </div>
            <button
              type="button"
              className="mobile-player-canvas-toggle"
              onClick={() => setCanvasOn((v) => !v)}
              aria-pressed={canvasOn}
              aria-label={canvasOn ? t('player.canvasPause') : t('player.canvasPlay')}
            >
              {canvasOn ? <IconCanvasPause /> : <IconCanvasPlay />}
              <span>{t('player.canvas')}</span>
            </button>
          </div>

          <div className="mobile-player-titles">
            <h2 className="mobile-player-title-ta" lang="ta">
              {track.titleTa || track.titleEn}
            </h2>
            {track.titleEn && track.titleTa && (
              <p className="mobile-player-title-en">{track.titleEn}</p>
            )}
            <p className="mobile-player-artist">{track.artist}</p>
            <p className="mobile-player-composer">
              {t('player.composer')}: {composer}
            </p>
          </div>

          <div className="mobile-player-seek">
            <input
              type="range"
              className="player-seek"
              min="0"
              max={duration > 0 ? Math.floor(duration) : 0}
              step="1"
              value={Math.floor(currentTime)}
              onChange={(e) => seekTo(Number(e.target.value))}
              aria-label={t('player.seek')}
            />
            <div className="mobile-player-times">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="mobile-player-controls">
            <button
              type="button"
              className={`mobile-player-skip ${shuffle ? 'is-active' : ''}`}
              onClick={toggleShuffle}
              aria-label={t('common.shuffle')}
              aria-pressed={shuffle}
            >
              <IconShuffle />
            </button>
            <button
              type="button"
              className="mobile-player-skip"
              onClick={prev}
              aria-label={t('common.previous')}
            >
              <IconPrev />
            </button>
            <button
              type="button"
              className="mobile-player-play"
              onClick={playPause}
              aria-label={isPlaying ? t('common.pause') : t('common.play')}
            >
              {/* key remounts the icon on play-state change so the pop
                  animation replays — the toggle reads as instant. */}
              <span key={isPlaying ? 'pause' : 'play'} className="player-play-icon">
                {isPlaying ? <IconPause /> : <IconPlay />}
              </span>
            </button>
            <button
              type="button"
              className="mobile-player-skip"
              onClick={next}
              aria-label={t('common.next')}
            >
              <IconNext />
            </button>
            <button
              type="button"
              className={`mobile-player-skip ${repeat !== 'off' ? 'is-active' : ''}`}
              onClick={cycleRepeat}
              aria-label={`${t('common.repeat')}: ${repeat}`}
              aria-pressed={repeat !== 'off'}
            >
              <span aria-hidden="true">{repeat === 'one' ? '↻¹' : '↻'}</span>
            </button>
          </div>

          <div className="mobile-player-volume">
            <IconVolumeLow />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label={t('common.volume')}
            />
            <IconVolumeHigh />
          </div>

          <div className="mobile-player-actions">
            <button
              type="button"
              className={`mobile-player-action ${view === 'lyrics' ? 'is-active' : ''}`}
              onClick={() => setView(view === 'lyrics' ? 'cover' : 'lyrics')}
              aria-pressed={view === 'lyrics'}
            >
              {t('common.lyrics')}
            </button>
            <button
              type="button"
              className={`mobile-player-action ${panel === 'story' ? 'is-active' : ''}`}
              onClick={() => setPanel(panel === 'story' ? null : 'story')}
              aria-expanded={panel === 'story'}
            >
              {t('player.story')}
            </button>
            <button
              type="button"
              className={`mobile-player-action ${panel === 'queue' ? 'is-active' : ''}`}
              onClick={() => setPanel(panel === 'queue' ? null : 'queue')}
              aria-expanded={panel === 'queue'}
            >
              {t('common.upNext')}
            </button>
            <button
              type="button"
              className="mobile-player-action"
              onClick={() => setQuality(quality === '128' ? '320' : '128')}
              aria-label={`${t('common.quality')} ${quality} kbps`}
            >
              {quality} kbps
            </button>
            <button
              type="button"
              className="mobile-player-action mobile-player-share"
              onClick={share}
              aria-label={t('common.share')}
            >
              <IconShare />
              <span>{shared ? t('player.copied') : t('common.share')}</span>
            </button>
          </div>

          {/* Secondary actions (Spotify batch, 27 Nov 2026): share-as-status
              card (PT-025), offline pin (PT-019), hide (F-019), sleep
              timer (PT-014). The sleep button shows the remaining time
              while a timer is active. */}
          <div className="mobile-player-actions mobile-player-actions--secondary">
            <button
              type="button"
              className="mobile-player-action"
              onClick={shareCard}
              disabled={cardBusy}
            >
              <Icon name="share" size={18} />
              <span>{t('share.statusCard')}</span>
            </button>
            <PinButton track={track} variant="icon" />
            <HideButton track={track} variant="icon" />
            <button
              type="button"
              className={`mobile-player-action${sleepTimer ? ' is-active' : ''}`}
              onClick={() => setSleepOpen(true)}
              // WCAG 2.5.3: when a timer is active the visible text is the
              // countdown (or "End of track"), so the accessible name must
              // contain that same text — a fixed "Sleep timer" label would
              // not contain the visible "4:57".
              aria-label={
                sleepTimer?.mode === 'minutes'
                  ? t('player.sleepRemaining', { time: formatSleepRemaining(sleepRemainingSec * 1000) })
                  : sleepTimer
                    ? t('player.sleepEndOfTrack')
                    : t('player.sleepTimer')
              }
              aria-pressed={Boolean(sleepTimer)}
            >
              <Icon name="moon" size={18} />
              <span>
                {sleepTimer
                  ? sleepTimer.mode === 'minutes'
                    ? formatSleepRemaining(sleepRemainingSec * 1000)
                    : t('player.sleepEndOfTrack')
                  : t('player.sleepTimer')}
              </span>
            </button>
          </div>

          {panel === 'story' && (
            <div className="mobile-player-panel">
              <StoryCard track={track} onClose={() => setPanel(null)} />
            </div>
          )}
          {panel === 'queue' && (
            <div className="mobile-player-panel">
              <QueuePanel />
            </div>
          )}
        </div>

        {/* Lyrics view: stacked below the controls on mobile; on
            tablet/desktop (>= 1024px) this becomes the side panel beside
            the player (see player.css). The cover is hidden on mobile
            while the lyrics view is active. */}
        {view === 'lyrics' && (
          <aside className="mobile-player-lyrics-side" aria-label={t('common.lyrics')}>
            <LyricsPanel track={track} className="lyrics-panel--side" />
          </aside>
        )}

        {/* Sleep timer sheet — rendered inside the player sheet so the
            focus trap covers it; position:fixed places it visually. */}
        <SleepTimerSheet open={sleepOpen} onClose={() => setSleepOpen(false)} />
      </div>
    </div>
  )
}
