import { useI18n } from '../lib/i18n.js'
import './player.css'

/**
 * StoryCard — "About the song" card shown in the full-screen player.
 * Props: { track, onClose?: () => void }
 * Shows 2–3 lines of story (Tamil + English), the composer credit, and the
 * album / genre / release info. When the track has no story text, only the
 * composer + album credits are shown (empty state).
 */
export default function StoryCard({ track, onClose }) {
  const { t } = useI18n()

  if (!track) return null

  const composer = track.composer || 'Siddha Guruji'
  const storyTa = (track.storyTa || '').trim()
  const storyEn = (track.storyEn || '').trim()
  const hasStory = Boolean(storyTa || storyEn)

  return (
    <section className="story-card" aria-label={t('player.aboutSong')}>
      <div className="story-card-head">
        <h3>{t('player.aboutSong')}</h3>
        {onClose && (
          <button
            type="button"
            className="player-icon-btn story-card-close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>

      {hasStory && (
        <>
          {storyTa && (
            <p className="story-card-story-ta" lang="ta">
              {storyTa}
            </p>
          )}
          {storyEn && (
            <p className="story-card-story-en" lang="en">
              {storyEn}
            </p>
          )}
        </>
      )}

      {track.storyCredit && (
        <p className="story-card-credit">{track.storyCredit}</p>
      )}

      <dl className="story-card-meta">
        <div>
          <dt>{t('player.composer')}</dt>
          <dd>{composer}</dd>
        </div>
        {track.album && (
          <div>
            <dt>{t('player.album')}</dt>
            <dd>{track.album}</dd>
          </div>
        )}
        {track.genre && (
          <div>
            <dt>{t('player.genre')}</dt>
            <dd>{track.genre}</dd>
          </div>
        )}
        {track.releaseDate && (
          <div>
            <dt>{t('player.releaseDate')}</dt>
            <dd>{track.releaseDate}</dd>
          </div>
        )}
      </dl>
    </section>
  )
}
