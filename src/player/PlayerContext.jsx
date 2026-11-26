import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useMediaSession } from './useMediaSession.js'
import { useAuth } from '../lib/auth.jsx'
import {
  resolvePlayableUrl,
  isSignedTrack,
  dropSignedAudioUrl,
  SIGNED_TRACK_FILE,
} from '../lib/signedAudio.js'

// ---------------------------------------------------------------------------
// Optional parallel-module integrations (catalog.js / cache.js / config.js
// are being written by other agents). They are loaded dynamically so the
// player still builds and runs if they land late; behaviour is identical
// once they exist.
//   - recordPlay(trackId)            from '../lib/cache.js'
//   - audioUrl(track, quality)      from '../lib/config.js'
//   - getTrack(id) etc.             from '../data/catalog.js' (not needed
//     here — the player only ever receives full track objects)
// ---------------------------------------------------------------------------
let recordPlayFn = null
let audioUrlHelper = null

import('../lib/cache.js')
  .then((m) => {
    if (typeof m.recordPlay === 'function') recordPlayFn = m.recordPlay
  })
  .catch(() => {
    /* cache.js not present yet — play-counts are skipped silently */
  })

import('../lib/config.js')
  .then((m) => {
    if (typeof m.audioUrl === 'function') audioUrlHelper = m.audioUrl
  })
  .catch(() => {
    /* config.js not present yet — fall back to track.audio128/audio320 */
  })

const PlayerContext = createContext(null)

const LS_VOLUME = 'nandha-player-volume'
const LS_QUALITY = 'nandha-player-quality'
const LS_QUEUE = 'nandha-player-queue'
const LS_NOW_PLAYING = 'nandha-now-playing-id'

// Guest preview limit (user rule, 26 Nov 2026): without sign-in only the
// first 5 seconds of a song play; signed-in users get the full song.
// Enforced in the <audio> timeupdate handler + seekTo (see below).
export const PREVIEW_SECONDS = 5

const UNPLAYABLE_NOTICE = 'Could not play this track — try again'

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

function readVolume() {
  try {
    const raw = localStorage.getItem(LS_VOLUME)
    const v = raw == null ? 0.8 : Number(raw)
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8
  } catch {
    return 0.8
  }
}

function readQuality() {
  try {
    return localStorage.getItem(LS_QUALITY) === '320' ? '320' : '128'
  } catch {
    return '128'
  }
}

function readQueue() {
  const saved = readJSON(LS_QUEUE, null)
  if (saved && Array.isArray(saved.queue)) {
    return {
      queue: saved.queue,
      queueIndex:
        Number.isInteger(saved.queueIndex) &&
        saved.queueIndex >= 0 &&
        saved.queueIndex < saved.queue.length
          ? saved.queueIndex
          : 0,
    }
  }
  return { queue: [], queueIndex: 0 }
}

/** Resolve the playable audio URL for a track at a given quality. */
export function resolveAudioUrl(track, quality = '128') {
  if (!track) return null
  if (audioUrlHelper) {
    try {
      const url = audioUrlHelper(track, quality)
      if (url) return url
    } catch {
      /* fall through to the raw fields */
    }
  }
  const url = quality === '320' ? track.audio320 || track.audio128 : track.audio128 || track.audio320
  return url || null
}

export function isPlayable(track, quality = '128') {
  if (!track) return false
  return Boolean(resolveAudioUrl(track, quality))
}

/**
 * Hook start for Discover-feed playback: when a track is played from the
 * Discover feed (opts.fromDiscover), playback starts at track.hookStartSec
 * instead of 0. Returns 0 for a normal start, a missing/invalid hook, or a
 * hook at/after the end of the track.
 */
export function hookStartFor(track, opts = {}) {
  if (!opts || !opts.fromDiscover) return 0
  const start = Number(track?.hookStartSec)
  if (!Number.isFinite(start) || start <= 0) return 0
  if (Number.isFinite(track?.durationSec) && start >= track.durationSec) return 0
  return start
}

function formatTime(s) {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function PlayerProvider({ children }) {
  // Guest preview gate (Fix 3): signed-in state comes from AuthProvider,
  // which wraps PlayerProvider in App.jsx. `user` is null while the
  // session is still restoring, so a signed-in listener is briefly
  // treated as a guest — the sign-in effect below clears the prompt
  // as soon as the session lands.
  const { user } = useAuth()
  const isGuest = !user
  const [previewEnded, setPreviewEnded] = useState(false)
  const guestRef = useRef(isGuest)
  const previewEndedRef = useRef(false)

  const audioRef = useRef(null)
  const prefetchRef = useRef(null)
  const noticeTimerRef = useRef(null)
  const playCountedRef = useRef(null) // track id already counted this play
  const prefetchedForRef = useRef(null) // `${trackId}@${quality}` already prefetched
  const queueRef = useRef([])
  const queueIndexRef = useRef(0)
  const qualityRef = useRef(readQuality())
  const repeatRef = useRef('off')
  const shuffleRef = useRef(false)
  const trackRef = useRef(null)
  const loadSeqRef = useRef(0) // guards stale signed-URL resolutions
  const signedRetryRef = useRef(null) // track id already retried once after an expiry error

  const initialQueue = useMemo(readQueue, [])
  const [queue, setQueue] = useState(initialQueue.queue)
  const [queueIndex, setQueueIndex] = useState(initialQueue.queueIndex)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(readVolume)
  const [quality, setQualityState] = useState(readQuality)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState('off')
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [notice, setNotice] = useState(null)

  const track = queue.length > 0 ? queue[queueIndex] || null : null

  // Keep refs in sync (event handlers read refs, not stale closures).
  useEffect(() => {
    queueRef.current = queue
  }, [queue])
  useEffect(() => {
    queueIndexRef.current = queueIndex
  }, [queueIndex])
  useEffect(() => {
    qualityRef.current = quality
  }, [quality])
  useEffect(() => {
    repeatRef.current = repeat
  }, [repeat])
  useEffect(() => {
    shuffleRef.current = shuffle
  }, [shuffle])
  useEffect(() => {
    trackRef.current = track
  }, [track])

  // Keep the preview-gate refs in sync (audio handlers read refs, not
  // stale closures, so the gate works without re-subscribing handlers).
  useEffect(() => {
    guestRef.current = isGuest
  }, [isGuest])
  useEffect(() => {
    previewEndedRef.current = previewEnded
  }, [previewEnded])

  // Signing in lifts the preview gate: clear the ended prompt so the
  // listener can resume from where the preview stopped.
  useEffect(() => {
    if (user) {
      previewEndedRef.current = false
      setPreviewEnded(false)
    }
  }, [user])

  const showNotice = useCallback((message) => {
    setNotice(message)
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = setTimeout(() => setNotice(null), 4000)
  }, [])

  // Persist queue + volume + quality.
  useEffect(() => {
    try {
      localStorage.setItem(LS_QUEUE, JSON.stringify({ queue, queueIndex }))
    } catch {
      /* storage unavailable (private mode) — ignore */
    }
  }, [queue, queueIndex])

  useEffect(() => {
    try {
      localStorage.setItem(LS_VOLUME, String(volume))
    } catch {
      /* ignore */
    }
  }, [volume])

  useEffect(() => {
    try {
      localStorage.setItem(LS_QUALITY, quality)
    } catch {
      /* ignore */
    }
  }, [quality])

  // Tell pwa.js which track is playing so the cache never evicts it.
  useEffect(() => {
    try {
      if (track) localStorage.setItem(LS_NOW_PLAYING, String(track.id))
      else localStorage.removeItem(LS_NOW_PLAYING)
    } catch {
      /* ignore */
    }
  }, [track])

  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    if (prefetchRef.current) {
      prefetchRef.current.src = ''
      prefetchRef.current = null
    }
  }, [])

  /**
   * Attach a playable src to the shared <audio> element. Async because the
   * real track's URL is minted per play from the Edge Function (300 s
   * signed URL); every other track resolves synchronously. `silent`
   * suppresses the failure notice (used by the mount restore, which runs
   * without a user gesture). Returns false when no URL could be resolved.
   * Stale guard: if the user moved to another track while the signed URL
   * was being minted, the late result is discarded.
   */
  const attachSrc = useCallback(
    async (
      audio,
      trackToLoad,
      qualityValue,
      { autoplay = true, startAt = 0, silent = false } = {},
    ) => {
      const seq = loadSeqRef.current
      const url = await resolvePlayableUrl(trackToLoad, qualityValue)
      if (seq !== loadSeqRef.current) return false
      if (!url) {
        if (!silent) {
          showNotice('Could not play this track — try again')
          setIsPlaying(false)
        }
        return false
      }
      audio.src = url
      audio.load()

      // Clamp the hook start inside the track; 0 = normal start.
      const hookAt =
        Number.isFinite(startAt) &&
        startAt > 0 &&
        (!Number.isFinite(trackToLoad.durationSec) ||
          startAt < trackToLoad.durationSec)
          ? startAt
          : 0

      const startPlayback = () => {
        audio
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {
            // Autoplay blocked (e.g. iOS needs a gesture) — stay paused,
            // the user can tap play. Not an error.
            setIsPlaying(false)
          })
      }

      if (hookAt > 0) {
        // Seek only once metadata is available, then start playing.
        setCurrentTime(hookAt)
        const applyStart = () => {
          audio.removeEventListener('loadedmetadata', applyStart)
          try {
            audio.currentTime = hookAt
          } catch {
            /* seeking before enough data — the timeupdate handler recovers */
          }
          setCurrentTime(hookAt)
          if (autoplay) startPlayback()
        }
        // Metadata may already be cached (e.g. restored session).
        if (audio.readyState >= 1) applyStart()
        else audio.addEventListener('loadedmetadata', applyStart)
      } else if (autoplay) {
        startPlayback()
      }
      return true
    },
    [showNotice],
  )

  /** Load (but do not necessarily play) the track at `index`. Returns false
   *  when the track has no audio — caller then skips on.
   *  `opts.startAt` (seconds) starts playback part-way in — used for
   *  Discover-feed hook playback; 0 (default) starts at the beginning. */
  const loadTrackAt = useCallback(
    (index, { autoplay = true, startAt = 0 } = {}) => {
      const list = queueRef.current
      const nextTrack = list[index]
      if (!nextTrack) return false
      const audio = audioRef.current
      if (!audio) return false

      setQueueIndex(index)
      setCurrentTime(0)
      setDuration(
        Number.isFinite(nextTrack.durationSec) ? nextTrack.durationSec : 0,
      )
      playCountedRef.current = null
      prefetchedForRef.current = null
      // A new track starts a fresh guest preview.
      previewEndedRef.current = false
      setPreviewEnded(false)
      if (prefetchRef.current) {
        prefetchRef.current.src = ''
        prefetchRef.current = null
      }

      if (!isPlayable(nextTrack, qualityRef.current)) {
        showNotice(UNPLAYABLE_NOTICE)
        audio.removeAttribute('src')
        audio.load()
        setIsPlaying(false)
        return false
      }

      loadSeqRef.current += 1
      signedRetryRef.current = null
      // Fire-and-forget: the signed URL is minted async, but the track IS
      // playable, so loadTrackAt still returns true synchronously (callers
      // rely on it to decide whether to skip on). attachSrc shows a notice
      // itself if the URL cannot be minted.
      attachSrc(audio, nextTrack, qualityRef.current, {
        autoplay,
        startAt,
      })
      return true
    },
    [showNotice, attachSrc],
  )

  /** Advance to the next playable track from `fromIndex`. Returns true if
   *  one was loaded. The loop guard covers a queue of unplayable tracks. */
  const skipToNextPlayable = useCallback(
    (fromIndex, { autoplay = true } = {}) => {
      const list = queueRef.current
      if (list.length === 0) return false
      for (let step = 1; step <= list.length; step += 1) {
        const idx = (fromIndex + step) % list.length
        if (isPlayable(list[idx], qualityRef.current)) {
          return loadTrackAt(idx, { autoplay })
        }
      }
      // No playable track in the whole queue.
      showNotice(UNPLAYABLE_NOTICE)
      setIsPlaying(false)
      return false
    },
    [loadTrackAt, showNotice],
  )

  const pickNextIndex = useCallback((currentIdx) => {
    const list = queueRef.current
    if (list.length <= 1) return currentIdx
    if (shuffleRef.current) {
      let idx = currentIdx
      while (idx === currentIdx) {
        idx = Math.floor(Math.random() * list.length)
      }
      return idx
    }
    return (currentIdx + 1) % list.length
  }, [])

  const next = useCallback(() => {
    const list = queueRef.current
    if (list.length === 0) return
    const idx = pickNextIndex(queueIndexRef.current)
    if (!loadTrackAt(idx)) {
      // Landed on an unplayable track — keep walking forward.
      skipToNextPlayable(idx)
    }
  }, [loadTrackAt, pickNextIndex, skipToNextPlayable])

  const prev = useCallback(() => {
    const audio = audioRef.current
    const list = queueRef.current
    if (list.length === 0) return
    // If more than 3s in, restart the current track (standard behaviour).
    // For a guest this also re-opens the 5s preview from the start.
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      setCurrentTime(0)
      previewEndedRef.current = false
      setPreviewEnded(false)
      return
    }
    const idx =
      (queueIndexRef.current - 1 + list.length) % list.length
    if (!loadTrackAt(idx)) {
      // Walk backwards for a playable track.
      for (let step = 1; step <= list.length; step += 1) {
        const back = (idx - step + list.length * 2) % list.length
        if (isPlayable(list[back], qualityRef.current)) {
          loadTrackAt(back)
          return
        }
      }
      showNotice(UNPLAYABLE_NOTICE)
    }
  }, [loadTrackAt, showNotice])

  /** Play a track. `opts.fromDiscover` starts at the track's hook
   *  (track.hookStartSec, default 0) instead of the beginning.
   *  M4: for a guest, a hook at/past the 5s preview limit is forced to
   *  0 — otherwise the gate pauses immediately and the guest hears
   *  nothing. Signed-in users keep hook playback unchanged.
   *  Existing 1- and 2-arg calls are unchanged. */
  const play = useCallback(
    (trackToPlay, queueList, opts = {}) => {
      if (!trackToPlay) return
      let hookAt = hookStartFor(trackToPlay, opts)
      if (guestRef.current && hookAt >= PREVIEW_SECONDS) hookAt = 0
      if (queueList && Array.isArray(queueList) && queueList.length > 0) {
        queueRef.current = queueList
        setQueue(queueList)
        const idx = queueList.findIndex((t) => t && t.id === trackToPlay.id)
        const target = idx >= 0 ? idx : 0
        queueIndexRef.current = target
        if (!loadTrackAt(target, { startAt: hookAt })) {
          skipToNextPlayable(target)
        }
        return
      }
      const list = queueRef.current
      const existing = list.findIndex((t) => t && t.id === trackToPlay.id)
      if (existing >= 0) {
        if (!loadTrackAt(existing, { startAt: hookAt })) skipToNextPlayable(existing)
      } else {
        const nextList = [...list, trackToPlay]
        queueRef.current = nextList
        setQueue(nextList)
        const target = nextList.length - 1
        queueIndexRef.current = target
        if (!loadTrackAt(target, { startAt: hookAt })) skipToNextPlayable(target)
      }
    },
    [loadTrackAt, skipToNextPlayable],
  )

  const playPause = useCallback(() => {
    const audio = audioRef.current
    const current = trackRef.current
    if (!audio || !current) return
    if (audio.paused) {
      if (!isPlayable(current, qualityRef.current)) {
        showNotice(UNPLAYABLE_NOTICE)
        skipToNextPlayable(queueIndexRef.current)
        return
      }
      // A guest whose preview ended restarts the 5s preview from 0
      // (tapping play again after the prompt must not resume past 5s).
      if (guestRef.current && previewEndedRef.current) {
        previewEndedRef.current = false
        setPreviewEnded(false)
        audio.currentTime = 0
        setCurrentTime(0)
      }
      // (Re)attach src if it was cleared (e.g. after a skip).
      // The signed URL is minted async; attachSrc starts playback itself.
      if (!audio.src) {
        loadSeqRef.current += 1
        attachSrc(audio, current, qualityRef.current, { autoplay: true })
        return
      }
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false))
    } else {
      audio.pause()
      setIsPlaying(false)
    }
  }, [showNotice, skipToNextPlayable, attachSrc])

  const seekTo = useCallback((seconds) => {
    const audio = audioRef.current
    if (!audio) return
    const dur = Number.isFinite(audio.duration)
      ? audio.duration
      : Number.isFinite(trackRef.current?.durationSec)
        ? trackRef.current.durationSec
        : 0
    let clamped = Math.min(Math.max(0, seconds), dur || 0)
    // Guest preview gate: seeking past 5s clamps to 5s, pauses, and shows
    // the sign-in prompt. Seeking back inside the preview window re-opens
    // the preview. Signed-in users seek freely.
    if (guestRef.current) {
      if (clamped >= PREVIEW_SECONDS) {
        clamped = PREVIEW_SECONDS
        previewEndedRef.current = true
        setPreviewEnded(true)
        audio.pause()
        setIsPlaying(false)
      } else {
        previewEndedRef.current = false
        setPreviewEnded(false)
      }
    }
    audio.currentTime = clamped
    setCurrentTime(clamped)
  }, [])

  // Media Session API: lock-screen / notification controls + metadata.
  // Guarded inside the hook ('mediaSession' in navigator); no-ops where
  // the API is missing. Metadata refreshes whenever the track changes.
  useMediaSession({
    track,
    isPlaying,
    onPlayPause: playPause,
    onNext: next,
    onPrev: prev,
    onSeek: seekTo,
  })

  const setVolume = useCallback((v) => {
    const clamped = Math.min(1, Math.max(0, Number(v) || 0))
    setVolumeState(clamped)
    if (audioRef.current) audioRef.current.volume = clamped
  }, [])

  const setQuality = useCallback((q) => {
    const nextQ = q === '320' ? '320' : '128'
    if (nextQ === qualityRef.current) return
    qualityRef.current = nextQ
    setQualityState(nextQ)
    const audio = audioRef.current
    const current = trackRef.current
    if (!audio || !current || !isPlayable(current, nextQ)) return
    const wasPlaying = !audio.paused
    // Guests never resume past the 5s preview limit.
    const resumeAt = guestRef.current
      ? Math.min(audio.currentTime || 0, PREVIEW_SECONDS)
      : audio.currentTime || 0
    const seq = loadSeqRef.current + 1
    loadSeqRef.current = seq
    resolvePlayableUrl(current, nextQ).then((url) => {
      if (seq !== loadSeqRef.current) return
      if (!url) {
        showNotice('Could not play this track — try again')
        setIsPlaying(false)
        return
      }
      audio.src = url
      audio.load()
      const onMeta = () => {
        audio.removeEventListener('loadedmetadata', onMeta)
        if (Number.isFinite(resumeAt) && resumeAt > 0) {
          try {
            audio.currentTime = resumeAt
          } catch {
            /* some streams reject seeking before enough data — ignore */
          }
        }
        if (wasPlaying) {
          audio.play().catch(() => setIsPlaying(false))
        }
      }
      audio.addEventListener('loadedmetadata', onMeta)
    })
  }, [showNotice])

  const toggleShuffle = useCallback(() => {
    setShuffle((s) => !s)
  }, [])

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))
  }, [])

  const addToQueue = useCallback((trackToAdd) => {
    if (!trackToAdd) return
    setQueue((prevQueue) => [...prevQueue, trackToAdd])
  }, [])

  const removeFromQueue = useCallback(
    (index) => {
      setQueue((prevQueue) => {
        if (index < 0 || index >= prevQueue.length) return prevQueue
        const nextQueue = prevQueue.filter((_, i) => i !== index)
        const currentIdx = queueIndexRef.current
        if (index === currentIdx) {
          // Removing the playing track: stop audio, play the next item.
          const audio = audioRef.current
          if (audio) {
            audio.pause()
            audio.removeAttribute('src')
            audio.load()
          }
          setIsPlaying(false)
          setCurrentTime(0)
          setDuration(0)
          if (nextQueue.length > 0) {
            const target = Math.min(currentIdx, nextQueue.length - 1)
            queueIndexRef.current = target
            setQueueIndex(target)
            // Defer so the queue state has landed before loading.
            setTimeout(() => {
              queueRef.current = nextQueue
              if (!loadTrackAt(target)) skipToNextPlayable(target)
            }, 0)
          } else {
            setQueueIndex(0)
            queueIndexRef.current = 0
          }
        } else if (index < currentIdx) {
          const target = currentIdx - 1
          queueIndexRef.current = target
          setQueueIndex(target)
        }
        return nextQueue
      })
    },
    [loadTrackAt, skipToNextPlayable],
  )

  const clearQueue = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    setQueue([])
    setQueueIndex(0)
    queueRef.current = []
    queueIndexRef.current = 0
    previewEndedRef.current = false
    setPreviewEnded(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setIsPlayerOpen(false)
    playCountedRef.current = null
  }, [])

  const openPlayer = useCallback(() => setIsPlayerOpen(true), [])
  const closePlayer = useCallback(() => setIsPlayerOpen(false), [])

  /**
   * Stop playback entirely (mini-player close button): pause, clear the
   * audio src, drop the cached signed URL, clear the track + queue, close
   * the expanded player, and clear the now-playing key. The player bar
   * renders only when a current track exists, so it disappears too.
   */
  const stopPlayback = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    loadSeqRef.current += 1
    signedRetryRef.current = null
    if (prefetchRef.current) {
      prefetchRef.current.src = ''
      prefetchRef.current = null
    }
    dropSignedAudioUrl(SIGNED_TRACK_FILE)
    setQueue([])
    setQueueIndex(0)
    queueRef.current = []
    queueIndexRef.current = 0
    previewEndedRef.current = false
    setPreviewEnded(false)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setIsPlayerOpen(false)
    playCountedRef.current = null
    prefetchedForRef.current = null
    try {
      localStorage.removeItem(LS_NOW_PLAYING)
    } catch {
      /* ignore */
    }
  }, [])

  // --- <audio> element wiring (single element, rendered once below) -------
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = readVolume()
    audio.preload = 'metadata'

    const onTimeUpdate = () => {
      const t = audio.currentTime || 0
      setCurrentTime(t)
      const dur = audio.duration
      const total = Number.isFinite(dur) ? dur : trackRef.current?.durationSec || 0
      if (total > 0) setDuration(total)

      // Guest preview gate — the 5s enforcement point: as soon as a
      // guest's playback reaches 5.0s, pause and show the sign-in
      // prompt. Signed-in users are unaffected (guestRef is false).
      if (guestRef.current && !previewEndedRef.current && t >= PREVIEW_SECONDS) {
        previewEndedRef.current = true
        setPreviewEnded(true)
        audio.pause()
        setIsPlaying(false)
      }

      // Play-count: past 30s, or on completion (see onEnded). Once per track.
      const current = trackRef.current
      if (
        current &&
        playCountedRef.current !== current.id &&
        t >= 30 &&
        recordPlayFn
      ) {
        playCountedRef.current = current.id
        try {
          recordPlayFn(current.id)
        } catch {
          /* never let analytics break playback */
        }
      }

      // Preload NEXT track only: past 80% or 30s remain.
      if (current && total > 0) {
        const remaining = total - t
        const key = `${current.id}@${qualityRef.current}`
        if (
          (t / total >= 0.8 || remaining <= 30) &&
          prefetchedForRef.current !== key
        ) {
          prefetchedForRef.current = key
          const nextIdx = pickNextIndex(queueIndexRef.current)
          const nextTrack = queueRef.current[nextIdx]
          if (
            nextTrack &&
            nextTrack.id !== current.id &&
            isPlayable(nextTrack, qualityRef.current) &&
            // Signed tracks mint their URL on demand — prefetching would
            // burn a short-lived URL, and the old Pages path is dead.
            !isSignedTrack(nextTrack, qualityRef.current)
          ) {
            const url = resolveAudioUrl(nextTrack, qualityRef.current)
            if (url) {
              try {
                // Fetch just the first chunk (Range) — warms the HTTP
                // cache without downloading the whole file.
                fetch(url, { headers: { Range: 'bytes=0-65535' } }).catch(
                  () => {},
                )
                const pre = new Audio()
                pre.preload = 'auto'
                pre.src = url
                prefetchRef.current = pre
              } catch {
                /* prefetch is best-effort */
              }
            }
          }
        }
      }
    }

    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration)
    }

    const onEnded = () => {
      const current = trackRef.current
      if (current && playCountedRef.current !== current.id && recordPlayFn) {
        playCountedRef.current = current.id
        try {
          recordPlayFn(current.id)
        } catch {
          /* ignore */
        }
      }
      if (repeatRef.current === 'one') {
        audio.currentTime = 0
        setCurrentTime(0)
        playCountedRef.current = null
        audio.play().catch(() => setIsPlaying(false))
        return
      }
      const list = queueRef.current
      const isLast =
        !shuffleRef.current &&
        queueIndexRef.current >= list.length - 1
      if (isLast && repeatRef.current === 'off') {
        setIsPlaying(false)
        return
      }
      next()
    }

    const onError = () => {
      // Ignore errors when no src is set (sample tracks / cleared queue).
      if (!audio.getAttribute('src') && !audio.currentSrc) return
      const current = trackRef.current
      // Signed URL expired mid-play (403 on a Range request): mint a fresh
      // one and resume from where playback stopped. Once per track load.
      if (
        current &&
        isSignedTrack(current, qualityRef.current) &&
        signedRetryRef.current !== current.id
      ) {
        signedRetryRef.current = current.id
        // Guests never resume past the 5s preview limit.
        const resumeAt = guestRef.current
          ? Math.min(audio.currentTime || 0, PREVIEW_SECONDS)
          : audio.currentTime || 0
        dropSignedAudioUrl(SIGNED_TRACK_FILE)
        loadSeqRef.current += 1
        const seq = loadSeqRef.current
        resolvePlayableUrl(current, qualityRef.current).then((url) => {
          if (seq !== loadSeqRef.current) return
          if (!url) {
            showNotice('Could not play this track — skipping')
            setIsPlaying(false)
            skipToNextPlayable(queueIndexRef.current)
            return
          }
          audio.src = url
          audio.load()
          const onMeta = () => {
            audio.removeEventListener('loadedmetadata', onMeta)
            if (Number.isFinite(resumeAt) && resumeAt > 0) {
              try {
                audio.currentTime = resumeAt
              } catch {
                /* ignore */
              }
            }
            audio.play().catch(() => setIsPlaying(false))
          }
          if (audio.readyState >= 1) onMeta()
          else audio.addEventListener('loadedmetadata', onMeta)
        })
        return
      }
      showNotice('Could not play this track — skipping')
      setIsPlaying(false)
      skipToNextPlayable(queueIndexRef.current)
    }

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
    }
  }, [next, pickNextIndex, showNotice, skipToNextPlayable])

  // Restore a persisted queue on mount: show the last track paused, but
  // never autoplay or start audio without a user gesture.
  useEffect(() => {
    const audio = audioRef.current
    const list = queueRef.current
    if (!audio || list.length === 0) return
    const idx = queueIndexRef.current
    const saved = list[idx]
    if (!saved) return
    setDuration(Number.isFinite(saved.durationSec) ? saved.durationSec : 0)
    if (isPlayable(saved, qualityRef.current)) {
      // Silent: no notice on failure (no user gesture yet — the function
      // may not be deployed, or the listener is offline).
      loadSeqRef.current += 1
      attachSrc(audio, saved, qualityRef.current, {
        autoplay: false,
        silent: true,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo(
    () => ({
      track,
      queue,
      queueIndex,
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
      isGuest,
      play,
      playPause,
      next,
      prev,
      seekTo,
      setVolume,
      setQuality,
      toggleShuffle,
      cycleRepeat,
      addToQueue,
      removeFromQueue,
      clearQueue,
      openPlayer,
      closePlayer,
      stopPlayback,
      setNotice: showNotice,
      formatTime,
      audioRef,
    }),
    [
      track,
      queue,
      queueIndex,
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
      isGuest,
      play,
      playPause,
      next,
      prev,
      seekTo,
      setVolume,
      setQuality,
      toggleShuffle,
      cycleRepeat,
      addToQueue,
      removeFromQueue,
      clearQueue,
      openPlayer,
      closePlayer,
      stopPlayback,
      showNotice,
    ],
  )

  return (
    <PlayerContext.Provider value={value}>
      {/* The ONE audio element for the whole app. */}
      <audio ref={audioRef} preload="metadata" playsInline />
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) {
    throw new Error('usePlayer must be used inside <PlayerProvider>')
  }
  return ctx
}

export { formatTime }
export default PlayerContext
