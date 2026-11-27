import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n.js'
import { usePlayer } from '../player/PlayerContext.jsx'
import { hideTrack, isHidden, unhideTrack } from '../lib/hiddenTracks.js'
import Icon from './Icons.jsx'

/**
 * HideButton (Spotify batch, 27 Nov 2026 — F-019): hides a track from
 * mixes and the taste profile. Hidden tracks stay playable and
 * searchable — they are only excluded from mixes / daypart / Discover
 * (see hiddenTracks.js). Feedback via the player's notice system.
 */
export default function HideButton({ track, variant = 'button' }) {
  const { t } = useI18n()
  const player = usePlayer()
  const [hidden, setHidden] = useState(() => (track ? isHidden(track.id) : false))

  useEffect(() => {
    if (!track) return
    const sync = () => setHidden(isHidden(track.id))
    sync()
    window.addEventListener('nandha-hidden-changed', sync)
    return () => window.removeEventListener('nandha-hidden-changed', sync)
  }, [track])

  if (!track) return null

  function handleClick() {
    if (hidden) {
      unhideTrack(track.id)
      setHidden(false)
      player?.setNotice?.(t('player.unhidden'))
    } else {
      hideTrack(track.id)
      setHidden(true)
      player?.setNotice?.(t('player.hidden'))
    }
  }

  const label = hidden ? t('player.unhide') : t('player.hide')
  if (variant === 'icon') {
    return (
      <button
        type="button"
        className={`player-icon-btn${hidden ? ' is-active' : ''}`}
        onClick={handleClick}
        aria-pressed={hidden}
        aria-label={label}
        title={label}
      >
        <Icon name="eyeOff" size={20} />
      </button>
    )
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={handleClick}
      aria-pressed={hidden}
    >
      <Icon name="eyeOff" size={16} /> {label}
    </button>
  )
}
