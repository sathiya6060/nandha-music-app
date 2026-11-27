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
import { recordPlay, flushPlays } from '../lib/cache.js'
import { audioUrl } from '../lib/config.js'
import { useTracks } from '../lib/supabaseCatalog.js'
import { getRadioCandidates } from '../lib/mixes.js'
import { getHiddenIds } from '../lib/hiddenTracks.js'
import { sleepEndsAt, sleepRemainingMs } from '../lib/sleepTimer.js'
import { getPinnedAudioBlobUrl } from '../lib/pwa.js'
import {
  resolvePlayableUrl,
  isSignedTrack,
  dropSignedAudioUrl,
  dropAllSignedAudioUrls,
  fileNameOf,
} from '../lib/signedAudio.js'

// Static imports (S9, 27 Nov 2026): cache.js and config.js used to be
// loaded with dynamic import() here, but both are statically imported
// elsewhere in the bundle, so the dynamic imports split nothing —
// Vite reported them as INEFFECTIVE_DYNAMIC_IMPORT. They are now
// plain static imports; recordPlay / audioUrl are called directly.
export const PREVIEW_SECONDS = 5

/** Pure guest-gate predicate, exported for tests (see guestGate.test.js). */
export function guestPreviewEnded(currentTime, isGuest) {
  return Boolean(isGuest) && currentTime >= PREVIEW_SECONDS
}

/** The player state after stopPlayback(): empty queue, no track,
 *  paused, closed. Exported for tests (see stopPlayback.test.js);
 *  stopPlayback() applies exactly these values. */
export function stoppedPlayerState() {
  return {
    queue: [],
    queueIndex: 0,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isPlayerOpen: false,
    previewEnded: false,
  }
}

const PlayerContext = createContext(null)

const LS_VOLUME = 'nandha-player-volume'
const LS_QUALITY = 'nandha-player-quality'
const LS_QUEUE = 'nandha-player-queue'
const LS_NOW_PLAYING = 'nandha-now-playing-id'
// Spotify batch (27 Nov 2026): user-added queue (PT-015), Smart
// Shuffle (PT-017) and radio autoplay (PT-016) are per-device prefs.
const LS_USER_QUEUE = 'nandha-player-userqueue'
const LS_SMART_SHUFFLE = 'nandha-player-smart-shuffle'
const LS_RADIO = 'nandha-player-radio'

// Guest preview limit (user rule, 26 Nov 2026): without sign-in only the
// first 5 seconds of a song play; signed-in users get the full song.
// Enforced in the <audio> timeupdate handler + seekTo (see below).
// (PREVIEW_SECONDS is exported at the top of this file for tests.)
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

/** User-added queue (PT-015): tracks the listener queued explicitly.
 *  These play BEFORE the context queue continues. */
function readUserQueue() {
  const saved = readJSON(LS_USER_QUEUE, null)
  return Array.isArray(saved) ? saved.filter(Boolean) : []
}

function readStoredFlag(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return defaultValue
    return raw === '1'
  } catch {
    return defaultValue
  }
}

/** Resolve the playable audio URL for a track at a given quality. */
function resolveAudioUrl(track, quality = '128') {
  if (!track) return null
  try {
    const url = audioUrl(track, quality)
    if (url) return url
  } catch {
    /* fall through to the raw fields */
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
function hookStartFor(track, opts = {}) {
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
  // Spotify batch (27 Nov 2026): radio-lite needs the catalog; the
  // hook shares Home's query cache, so this costs no extra fetch.
  const catalogRef = useRef([])
  const userQueueRef = useRef([])
  const smartShuffleRef = useRef(false)
  const radioRef = useRef(true)
  const smartInterleaveRef = useRef(false) // alternates normal / similar pick
  const sleepTimeoutRef = useRef(null) // minutes-timer id
  const sleepTimerRef = useRef(null) // current { mode, endsAt } for handlers
  const pinnedFallbackRef = useRef(null) // track id already played from its pin
  const pinnedBlobRef = useRef(null) // blob URL created for pinned playback

  const initialQueue = useMemo(() => readQueue(), [])
  const [queue, setQueue] = useState(initialQueue.queue)
  const [queueIndex, setQueueIndex] = useState(initialQueue.queueIndex)
  // User-added queue (PT-015) — plays before the context continues.
  const [userQueue, setUserQueue] = useState(() => readUserQueue())
  // Smart Shuffle-lite (PT-017) + radio autoplay (PT-016).
  const [smartShuffle, setSmartShuffle] = useState(() => readStoredFlag(LS_SMART_SHUFFLE, false))
  const [radioOn, setRadioOn] = useState(() => readStoredFlag(LS_RADIO, true))
  // Sleep timer (PT-014): null | { mode: 'minutes' | 'end-of-track', endsAt: number | null }.
  const [sleepTimer, setSleepTimerState] = useState(null)
  const [sleepRemainingSec, setSleepRemainingSec] = useState(0)
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

  // Item 6 (27 Nov 2026): seconds left in the guest 5s preview, or null
  // when there is no live preview (signed in, no track, preview already
  // ended). The mini player + full player show a "Sign in for full
  // songs" hint with this countdown BEFORE the gate fires; the 5s gate
  // itself is unchanged.
  const previewSecondsLeft = useMemo(() => {
    if (isGuest && track && !previewEnded) {
      const left = PREVIEW_SECONDS - currentTime
      return left > 0 ? Math.ceil(left) : null
    }
    return null
  }, [isGuest, track, previewEnded, currentTime])

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

  // Spotify batch state: keep refs in sync + persist the prefs.
  const tracksQuery = useTracks({ publishedOnly: true })
  useEffect(() => {
    if (Array.isArray(tracksQuery.data)) catalogRef.current = tracksQuery.data
  }, [tracksQuery.data])
  useEffect(() => {
    userQueueRef.current = userQueue
  }, [userQueue])
  useEffect(() => {
    smartShuffleRef.current = smartShuffle
  }, [smartShuffle])
  useEffect(() => {
    radioRef.current = radioOn
  }, [radioOn])
  useEffect(() => {
    sleepTimerRef.current = sleepTimer
  }, [sleepTimer])
  useEffect(() => {
    try {
      localStorage.setItem(LS_USER_QUEUE, JSON.stringify(userQueue))
    } catch {
      /* ignore */
    }
  }, [userQueue])
  useEffect(() => {
    try {
      localStorage.setItem(LS_SMART_SHUFFLE, smartShuffle ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [smartShuffle])
  useEffect(() => {
    try {
      localStorage.setItem(LS_RADIO, radioOn ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [radioOn])

  // Sleep-timer countdown display: tick once a second while a
  // minutes timer is armed. The firing itself is a setTimeout in
  // setSleepTimer (below), not this interval. The remaining-seconds
  // reset lives in clearSleepTimer/setSleepTimer (event handlers),
  // not here — setState synchronously in an effect is the
  // react(set-state-in-effect) pattern the lint baseline avoids.
  useEffect(() => {
    if (!sleepTimer || sleepTimer.mode !== 'minutes' || !sleepTimer.endsAt) {
      return undefined
    }
    const tick = () => {
      const left = sleepRemainingMs(sleepTimer.endsAt)
      setSleepRemainingSec(Math.ceil(left / 1000))
      if (left <= 0) clearInterval(id)
    }
    const id = setInterval(tick, 1000)
    tick()
    return () => clearInterval(id)
  }, [sleepTimer])

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
    if (sleepTimeoutRef.current) clearTimeout(sleepTimeoutRef.current)
    if (pinnedBlobRef.current) URL.revokeObjectURL(pinnedBlobRef.current)
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
      // Offline + pinned (PT-019): play the cached copy instead of
      // minting a signed URL the network cannot serve. The blob URL is
      // revoked when the next src is attached (see below) so repeated
      // plays do not leak object URLs.
      let url = null
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        url = await getPinnedAudioBlobUrl(trackToLoad)
      }
      if (!url) url = await resolvePlayableUrl(trackToLoad, qualityValue)
      if (seq !== loadSeqRef.current) return false
      if (!url) {
        if (!silent) {
          showNotice('Could not play this track — try again')
          setIsPlaying(false)
        }
        return false
      }
      if (pinnedBlobRef.current) {
        URL.revokeObjectURL(pinnedBlobRef.current)
        pinnedBlobRef.current = null
      }
      if (url.startsWith('blob:')) pinnedBlobRef.current = url
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
      pinnedFallbackRef.current = null
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

  /**
   * Radio-lite candidate (PT-016/017): a track similar to the current
   * one, from the loaded catalog — never the current track, never
   * anything already queued, never a hidden track. With a 1-track
   * catalog this is honestly null (no fake tracks).
   */
  const pickRadioCandidate = useCallback(() => {
    const catalog = catalogRef.current || []
    if (catalog.length === 0) return null
    const current = trackRef.current
    const exclude = new Set([
      ...queueRef.current.map((t) => t?.id),
      ...userQueueRef.current.map((t) => t?.id),
    ])
    const [candidate] = getRadioCandidates(catalog, current, {
      hiddenIds: getHiddenIds(),
      excludeIds: exclude,
      limit: 1,
    })
    return candidate || null
  }, [])

  /**
   * Play one user-added track now (PT-015): it leaves the user queue,
   * is spliced into the context queue right after the current track,
   * and plays. Returns false for a bad index.
   */
  const playFromUserQueue = useCallback((index) => {
    const pending = userQueueRef.current
    if (index < 0 || index >= pending.length) return false
    const item = pending[index]
    const rest = pending.filter((_, i) => i !== index)
    userQueueRef.current = rest
    setUserQueue(rest)
    const list = queueRef.current
    const insertAt = queueIndexRef.current + 1
    const nextList = [...list]
    nextList.splice(insertAt, 0, item)
    queueRef.current = nextList
    setQueue(nextList)
    if (!loadTrackAt(insertAt)) skipToNextPlayable(insertAt)
    return true
  }, [loadTrackAt, skipToNextPlayable])

  /**
   * Play the next user-added track (PT-015): the head of the user
   * queue plays before the context continues. False when empty.
   */
  const playNextFromUserQueue = useCallback(() => playFromUserQueue(0), [playFromUserQueue])

  /** Append a radio recommendation and play it (PT-016). False when
   *  there is no candidate (e.g. a 1-track catalog). */
  const playRadioCandidate = useCallback(() => {
    const candidate = pickRadioCandidate()
    if (!candidate) return false
    const list = queueRef.current
    const nextList = [...list, candidate]
    queueRef.current = nextList
    setQueue(nextList)
    if (!loadTrackAt(nextList.length - 1)) skipToNextPlayable(nextList.length - 1)
    return true
  }, [pickRadioCandidate, loadTrackAt, skipToNextPlayable])

  const next = useCallback(() => {
    const list = queueRef.current
    if (list.length === 0) return
    // 1. User-added tracks play before the context continues (PT-015).
    if (playNextFromUserQueue()) return
    // 2. Smart Shuffle-lite (PT-017): while shuffle is on, alternate a
    //    normal shuffle pick with a similar catalog track slipped in
    //    after the current one. No candidate (1-track catalog) falls
    //    through to the normal pick.
    if (shuffleRef.current && smartShuffleRef.current) {
      if (smartInterleaveRef.current) {
        smartInterleaveRef.current = false
        const candidate = pickRadioCandidate()
        if (candidate) {
          const insertAt = queueIndexRef.current + 1
          const nextList = [...list]
          nextList.splice(insertAt, 0, candidate)
          queueRef.current = nextList
          setQueue(nextList)
          if (!loadTrackAt(insertAt)) skipToNextPlayable(insertAt)
          return
        }
      } else {
        smartInterleaveRef.current = true
      }
    }
    const idx = pickNextIndex(queueIndexRef.current)
    if (!loadTrackAt(idx)) {
      // Landed on an unplayable track — keep walking forward.
      skipToNextPlayable(idx)
    }
  }, [loadTrackAt, pickNextIndex, skipToNextPlayable, playNextFromUserQueue, pickRadioCandidate])

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

  const toggleSmartShuffle = useCallback(() => {
    setSmartShuffle((s) => !s)
  }, [])

  const toggleRadio = useCallback(() => {
    setRadioOn((r) => !r)
  }, [])

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))
  }, [])

  /**
   * Add to queue (PT-015): user-added tracks go to the user queue,
   * which plays BEFORE the context queue continues — they are no
   * longer appended to the end of the context.
   */
  const addToQueue = useCallback((trackToAdd) => {
    if (!trackToAdd) return
    setUserQueue((prev) => [...prev, trackToAdd])
  }, [])

  const removeFromUserQueue = useCallback((index) => {
    setUserQueue((prev) => {
      if (index < 0 || index >= prev.length) return prev
      return prev.filter((_, i) => i !== index)
    })
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
    // The user queue goes with it — "clear" means nothing is up next.
    setUserQueue([])
    userQueueRef.current = []
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
    if (pinnedBlobRef.current) {
      URL.revokeObjectURL(pinnedBlobRef.current)
      pinnedBlobRef.current = null
    }
    loadSeqRef.current += 1
    signedRetryRef.current = null
    if (prefetchRef.current) {
      prefetchRef.current.src = ''
      prefetchRef.current = null
    }
    dropAllSignedAudioUrls()
    // Stop means stop: the sleep timer dies with playback, and the
    // user queue is cleared with the context queue.
    if (sleepTimeoutRef.current) {
      clearTimeout(sleepTimeoutRef.current)
      sleepTimeoutRef.current = null
    }
    setSleepTimerState(null)
    setUserQueue([])
    userQueueRef.current = []
    // The state reset below is exactly stoppedPlayerState() — keep the
    // two in sync (the test asserts the helper; the headless smoke test
    // asserts the live behaviour: audio cleared + bar hidden).
    const stopped = stoppedPlayerState()
    setQueue(stopped.queue)
    setQueueIndex(stopped.queueIndex)
    queueRef.current = stopped.queue
    queueIndexRef.current = stopped.queueIndex
    previewEndedRef.current = stopped.previewEnded
    setPreviewEnded(stopped.previewEnded)
    setIsPlaying(stopped.isPlaying)
    setCurrentTime(stopped.currentTime)
    setDuration(stopped.duration)
    setIsPlayerOpen(stopped.isPlayerOpen)
    playCountedRef.current = null
    prefetchedForRef.current = null
    try {
      localStorage.removeItem(LS_NOW_PLAYING)
    } catch {
      /* ignore */
    }
  }, [])

  /**
   * Sleep timer (PT-014): `minutes` (5/10/15/30/60) stops playback
   * when the time is up; 'end-of-track' stops at the end of the
   * current track (handled in onEnded); null clears it. Per-session
   * — it does not survive a reload, and stopPlayback clears it.
   */
  const setSleepTimer = useCallback((option) => {
    if (sleepTimeoutRef.current) {
      clearTimeout(sleepTimeoutRef.current)
      sleepTimeoutRef.current = null
    }
    if (option === null || option === undefined) {
      setSleepTimerState(null)
      return
    }
    if (option === 'end-of-track') {
      setSleepTimerState({ mode: 'end-of-track', endsAt: null })
      return
    }
    const minutes = Number(option)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setSleepTimerState(null)
      return
    }
    const endsAt = sleepEndsAt(minutes)
    setSleepTimerState({ mode: 'minutes', endsAt })
    sleepTimeoutRef.current = setTimeout(() => {
      sleepTimeoutRef.current = null
      setSleepTimerState(null)
      stopPlayback()
    }, Math.max(0, endsAt - Date.now()))
  }, [stopPlayback])

  const clearSleepTimer = useCallback(() => {
    if (sleepTimeoutRef.current) {
      clearTimeout(sleepTimeoutRef.current)
      sleepTimeoutRef.current = null
    }
    setSleepTimerState(null)
    setSleepRemainingSec(0)
  }, [])

  /**
   * Dismiss the guest preview-ended banner without signing in. The
   * prompt is advisory, never a trap: hiding it rewinds the preview
   * to 0 (still paused) so tapping play replays the 5s preview from
   * the start. Clearing the flag alone would resume at 5.08s and the
   * timeupdate gate would re-show the banner instantly.
   */
  const dismissPreviewPrompt = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      // Pause first (the gate already paused it — this is belt and
      // braces so dismiss can never resume playback), and guard the
      // seek: some streams reject seeking before enough data, and a
      // throw here must not skip the flag-clearing lines below and
      // leave the banner stuck on screen.
      audio.pause()
      try {
        audio.currentTime = 0
      } catch {
        /* ignore — the banner is hidden either way */
      }
    }
    previewEndedRef.current = false
    setPreviewEnded(false)
    setCurrentTime(0)
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
      if (!previewEndedRef.current && guestPreviewEnded(t, guestRef.current)) {
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
        t >= 30
      ) {
        playCountedRef.current = current.id
        try {
          recordPlay(current.id)
          // Flush promptly (not only on the 5-min timer): a play that is
          // counted should reach the DB now, so admin stats move at once.
          void flushPlays()
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
      if (current && playCountedRef.current !== current.id) {
        playCountedRef.current = current.id
        try {
          recordPlay(current.id)
          // Flush promptly (see the 30s branch above): a completed play
          // should reach the DB now, not on the 5-min timer.
          void flushPlays()
        } catch {
          /* ignore */
        }
      }
      // Sleep timer, end-of-track mode (PT-014): stop here instead of
      // advancing — and before the repeat-one branch, so an armed timer
      // is not defeated by one extra loop of the track. The minutes
      // timer is a separate setTimeout.
      if (sleepTimerRef.current?.mode === 'end-of-track') {
        setSleepTimerState(null)
        stopPlayback()
        return
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
        // User-added tracks first (PT-015), then radio-lite (PT-016):
        // continue with a recommendation instead of stopping. With no
        // candidate (1-track catalog) this stops, exactly as before.
        if (playNextFromUserQueue()) return
        if (radioRef.current && playRadioCandidate()) return
        // Nothing follows: actually pause the element, not just the
        // React state — otherwise the <audio> keeps playing after a
        // synthetic 'ended' (and the bar/element states disagree).
        // At a natural end the element is already paused, so this is
        // a no-op there.
        audio.pause()
        setIsPlaying(false)
        return
      }
      next()
    }

    const onError = async () => {
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
        dropSignedAudioUrl(fileNameOf(current, qualityRef.current))
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
      // Pinned fallback (PT-019): the network failed but a cached copy
      // exists — play it instead of skipping. Once per track, so a
      // failing blob cannot loop back here forever.
      if (current && pinnedFallbackRef.current !== current.id) {
        pinnedFallbackRef.current = current.id
        const pinned = await getPinnedAudioBlobUrl(current)
        if (pinned) {
          if (pinnedBlobRef.current) URL.revokeObjectURL(pinnedBlobRef.current)
          pinnedBlobRef.current = pinned
          audio.src = pinned
          audio.load()
          audio.play().catch(() => setIsPlaying(false))
          return
        }
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
  }, [next, pickNextIndex, showNotice, skipToNextPlayable, playNextFromUserQueue, playRadioCandidate, stopPlayback])

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
      previewSecondsLeft,
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
      dismissPreviewPrompt,
      setNotice: showNotice,
      formatTime,
      audioRef,
      // Spotify batch (27 Nov 2026): user queue, Smart Shuffle,
      // radio autoplay, sleep timer.
      userQueue,
      smartShuffle,
      radioOn,
      sleepTimer,
      sleepRemainingSec,
      toggleSmartShuffle,
      toggleRadio,
      removeFromUserQueue,
      playFromUserQueue,
      setSleepTimer,
      clearSleepTimer,
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
      previewSecondsLeft,
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
      dismissPreviewPrompt,
      showNotice,
      userQueue,
      smartShuffle,
      radioOn,
      sleepTimer,
      sleepRemainingSec,
      toggleSmartShuffle,
      toggleRadio,
      removeFromUserQueue,
      playFromUserQueue,
      setSleepTimer,
      clearSleepTimer,
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
