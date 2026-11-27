import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n.js'
import { usePlayer } from '../player/PlayerContext.jsx'
import { cachePinnedTrack, isTrackPinned, unpinTrack } from '../lib/pwa.js'
import { resolvePlayableUrl } from '../lib/signedAudio.js'
import Icon from './Icons.jsx'

/**
 * PinButton — the offline-pin toggle (Spotify batch, 27 Nov 2026 —
 * PT-019 / F-014). Wires the KEPT B9 pinning code in pwa.js to the UI:
 * pin downloads the audio into the Cache API (stable key), unpin
 * removes it. The real track's audio is a private Storage path, so
 * the playable (signed) URL is resolved first and passed as
 * opts.playableUrl — exactly what cachePinnedTrack expects. Feedback
 * goes through the player's notice system (role="status" in PlayerBar).
 */
export default function PinButton({ track, variant = 'button' }) {
  const { t } = useI18n()
  const player = usePlayer()
  const [pinned, setPinned] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!track) return
    let alive = true
    isTrackPinned(track).then((p) => {
      if (alive) setPinned(p)
    })
    const sync = (e) => {
      if (e?.detail?.trackId && String(e.detail.trackId) !== String(track.id)) return
      isTrackPinned(track).then((p) => {
        if (alive) setPinned(p)
      })
    }
    window.addEventListener('nandha-pinned-changed', sync)
    return () => {
      alive = false
      window.removeEventListener('nandha-pinned-changed', sync)
    }
  }, [track])

  if (!track) return null

  async function handleClick() {
    if (busy) return
    setBusy(true)
    try {
      if (pinned) {
        await unpinTrack(track)
        setPinned(false)
      } else {
        // Resolve the playable URL first (signed for the real track).
        const playableUrl = await resolvePlayableUrl(track, player?.quality || '128')
        const result = await cachePinnedTrack(track, {
          playableUrl,
          currentTrackId: player?.track?.id,
        })
        if (result.ok) {
          setPinned(true)
          player?.setNotice?.(t('player.pinSaved'))
        } else {
          player?.setNotice?.(t('player.pinFailed'))
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const label = pinned ? t('player.pinned') : t('player.pin')
  if (variant === 'icon') {
    return (
      <button
        type="button"
        className={`player-icon-btn${pinned ? ' is-active' : ''}`}
        onClick={handleClick}
        disabled={busy}
        aria-pressed={pinned}
        aria-label={label}
        title={label}
      >
        <Icon name="pin" size={20} />
      </button>
    )
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={handleClick}
      disabled={busy}
      aria-pressed={pinned}
    >
      <Icon name="pin" size={16} /> {label}
    </button>
  )
}
