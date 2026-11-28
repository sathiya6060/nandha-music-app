import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { usePlayer } from '../player/PlayerContext.jsx'

/**
 * Track card (grid / horizontal scroll).
 * Props: { track }. The cover plays the track; the title is a real
 * /track/ link (M20 — before this, no track link existed anywhere
 * in-app, so a card could only be played, never opened).
 */
export default function TrackCard({ track }) {
  const { t } = useI18n()
  const player = usePlayer()

  const title = track.titleTa || track.titleEn || 'Untitled'

  function handlePlay() {
    player?.play?.(track, [track])
  }

  return (
    <article className="track-card">
      <button
        type="button"
        className="track-card__play-btn"
        onClick={handlePlay}
        aria-label={`${t('common.play')}: ${title} — ${track.artist || 'Nandha Music'}`}
      >
        {track.cover ? (
          <img className="track-card__cover" src={track.cover} alt="" loading="lazy" width={800} height={800} />
        ) : (
          <span
            className="cover-placeholder track-card__cover"
            aria-hidden="true"
            style={{ fontSize: '3rem', aspectRatio: '1', width: '100%', height: 'auto' }}
          >
            N
          </span>
        )}
      </button>
      <h3 className="track-card__title">
        <Link to={`/track/${track.id}`}>{title}</Link>
      </h3>
      <p className="track-card__artist">{track.artist || 'Nandha Music'}</p>
    </article>
  )
}
