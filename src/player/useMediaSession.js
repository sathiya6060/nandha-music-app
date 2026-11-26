// useMediaSession — Media Session API wiring for the Nandha Music player.
//
// Sets navigator.mediaSession.metadata (title Tamil + English, artist,
// album, artwork from the track cover or /assets/nandha-logo.png) and the
// play / pause / previoustrack / nexttrack / seekto action handlers, so the
// lock screen, notification shade and connected devices can control
// playback. Everything is guarded with `'mediaSession' in navigator`, so
// browsers without the API (older Safari, some in-app webviews) skip it
// silently. Metadata updates whenever the track changes; handlers re-bind
// when the play state or callbacks change.

import { useEffect } from 'react'

const FALLBACK_ARTWORK = '/assets/nandha-logo.png'
const ARTWORK_SIZES = [96, 128, 192, 256, 512]

function artworkFor(track) {
  const src = track?.cover || FALLBACK_ARTWORK
  const type = /\.png$/i.test(src) ? 'image/png' : 'image/jpeg'
  return ARTWORK_SIZES.map((size) => ({
    src,
    sizes: `${size}x${size}`,
    type,
  }))
}

export function useMediaSession({
  track,
  isPlaying,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
}) {
  // Metadata — refresh on track change.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return
    }
    if (!track) {
      try {
        navigator.mediaSession.metadata = null
      } catch {
        /* ignore */
      }
      return
    }
    try {
      const title =
        [track.titleTa, track.titleEn].filter(Boolean).join(' · ') ||
        'Nandha Music'
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: track.artist || 'Nandha Music',
        album: track.album || 'Nandha Music',
        artwork: artworkFor(track),
      })
    } catch {
      /* MediaMetadata constructor unsupported — handlers below still work */
    }
    // Deps are the track's metadata fields, not the object identity, so a
    // queue re-render with a new object for the same track does not reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    track?.id,
    track?.titleTa,
    track?.titleEn,
    track?.artist,
    track?.album,
    track?.cover,
  ])

  // Action handlers.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return undefined
    }
    const ms = navigator.mediaSession
    const setHandler = (action, handler) => {
      try {
        ms.setActionHandler(action, handler)
      } catch {
        /* action unsupported on this browser — ignore */
      }
    }
    setHandler('play', () => {
      if (!isPlaying && onPlayPause) onPlayPause()
    })
    setHandler('pause', () => {
      if (isPlaying && onPlayPause) onPlayPause()
    })
    setHandler('previoustrack', () => {
      if (onPrev) onPrev()
    })
    setHandler('nexttrack', () => {
      if (onNext) onNext()
    })
    setHandler('seekto', (details) => {
      if (details && Number.isFinite(details.seekTime) && onSeek) {
        onSeek(details.seekTime)
      }
    })
    return () => {
      const actions = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto']
      actions.forEach((action) => setHandler(action, null))
    }
  }, [isPlaying, onPlayPause, onNext, onPrev, onSeek])
}

export default useMediaSession
