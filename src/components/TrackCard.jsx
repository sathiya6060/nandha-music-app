import { useI18n } from '../lib/i18n.js'
import { usePlayer } from '../player/PlayerContext.jsx'

/**
 * Track card (grid / horizontal scroll).
 * Props: { track }. Click plays the track via usePlayer().
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
        onClick={handlePlay}
        aria-label={`${t('common.play')}: ${title} — ${track.artist || 'Nandha Music'}`}
        style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}
      >
        {track.cover ? (
          <img className="track-card__cover" src={track.cover} alt="" loading="lazy" />
        ) : (
          <span
            className="cover-placeholder track-card__cover"
            aria-hidden="true"
            style={{ fontSize: '3rem', aspectRatio: '1', width: '100%', height: 'auto' }}
          >
            N
          </span>
        )}
        <h3 className="track-card__title">
          {title}{' '}
          {track.isSample ? <span className="badge">{t('common.sample')}</span> : null}
        </h3>
        <p className="track-card__artist">{track.artist || 'Nandha Music'}</p>
      </button>
    </article>
  )
}
