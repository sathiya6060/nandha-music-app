import { usePlayer } from './PlayerContext.jsx'
import { useI18n } from '../lib/i18n.js'
import './player.css'

function queueItemLabel(item) {
  return `${item.titleTa || item.titleEn} ${item.artist}${item.titleEn && item.titleTa ? ` · ${item.titleEn}` : ''}`
}

/**
 * QueuePanel — the up-next list.
 * Props: { onClose?: () => void } — used by the desktop popover in PlayerBar.
 * Inside MobilePlayer it is rendered inline (no close button needed).
 *
 * Spotify batch (27 Nov 2026): three sections, in play order —
 * 1. "Added by you": the user queue (PT-015), which plays before the
 *    context continues. 2. "Up next": the rest of the context queue.
 * 3. Toggles: Smart Shuffle-lite (PT-017) and radio autoplay (PT-016).
 * When both lists are empty the panel says what will happen next
 * (radio on: a recommendation; radio off: playback stops).
 * NOTE: the sections below deliberately have NO aria-label. The
 * PlayerBar is already role="region" aria-label="Now playing", so
 * labelling this panel's "Now playing" section the same way created a
 * duplicate landmark (axe landmark-unique, A-06). The h4 titles give
 * the structure instead.
 */
export default function QueuePanel({ onClose }) {
  const { t } = useI18n()
  const {
    track: currentTrack,
    queue,
    queueIndex,
    userQueue,
    smartShuffle,
    radioOn,
    play,
    playFromUserQueue,
    removeFromQueue,
    removeFromUserQueue,
    clearQueue,
    toggleSmartShuffle,
    toggleRadio,
  } = usePlayer()

  const upNext = queue.slice(queueIndex + 1)
  const isEmpty = queue.length === 0 && userQueue.length === 0

  return (
    <div className="queue-panel">
      <div className="queue-panel-head">
        <h3>{t('common.upNext')}{upNext.length + userQueue.length > 0 ? ` (${upNext.length + userQueue.length})` : ''}</h3>
        <div className="queue-panel-head-actions">
          <button
            type="button"
            className="queue-clear-btn"
            onClick={clearQueue}
            aria-label={t('common.clearQueue')}
          >
            {t('common.clear')}
          </button>
          {onClose && (
            <button type="button" className="player-icon-btn" onClick={onClose} aria-label={t('common.closeQueue')}>
              ✕
            </button>
          )}
        </div>
      </div>

      {isEmpty ? (
        <p className="queue-empty">{t('player.queueEmpty')}</p>
      ) : (
        <>
          {userQueue.length > 0 && (
            <section>
              <h4 className="queue-section-title">{t('player.addedByYou')}</h4>
              <ul className="queue-list">
                {userQueue.map((item, i) => (
                  <li key={`user-${item.id}-${i}`} className="queue-item">
                    <button
                      type="button"
                      className="queue-item-main"
                      onClick={() => playFromUserQueue(i)}
                      aria-label={`${t('common.play')}: ${queueItemLabel(item)}`}
                    >
                      <span className="queue-item-cover">
                        {item.cover ? (
                          <img src={item.cover} alt="" loading="lazy" />
                        ) : (
                          <span className="queue-item-cover-fallback" aria-hidden="true">N</span>
                        )}
                      </span>
                      <span className="queue-item-titles">
                        <span className="queue-item-title">{item.titleTa || item.titleEn}</span>
                        <span className="queue-item-artist">
                          {item.artist}
                          {item.titleEn && item.titleTa ? ` · ${item.titleEn}` : ''}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="queue-remove-btn"
                      onClick={() => removeFromUserQueue(i)}
                      aria-label={`${t('common.removeFromQueue')}: ${item.titleTa || item.titleEn}`}
                      title={t('common.removeFromQueue')}
                    >
                      <span aria-hidden="true">✕</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {currentTrack && (
            <section>
              <ul className="queue-list">
                <li className="queue-item is-current">
                  <span className="queue-item-main queue-item-main--static" aria-current="true">
                    <span className="queue-item-cover">
                      {currentTrack.cover ? (
                        <img src={currentTrack.cover} alt="" loading="lazy" />
                      ) : (
                        <span className="queue-item-cover-fallback" aria-hidden="true">N</span>
                      )}
                    </span>
                    <span className="queue-item-titles">
                      <span className="queue-item-title">
                        <span className="queue-now-playing" aria-hidden="true">♪ </span>
                        {currentTrack.titleTa || currentTrack.titleEn}
                      </span>
                      <span className="queue-item-artist">
                        {currentTrack.artist}
                        {currentTrack.titleEn && currentTrack.titleTa ? ` · ${currentTrack.titleEn}` : ''}
                      </span>
                    </span>
                  </span>
                </li>
              </ul>
            </section>
          )}

          {upNext.length > 0 && (
            <section>
              {userQueue.length > 0 && <h4 className="queue-section-title">{t('common.upNext')}</h4>}
              <ul className="queue-list">
                {upNext.map((item, j) => {
                  // The queue position is queueIndex + 1 + j by construction
                  // (upNext is a contiguous slice). Do NOT use
                  // queue.indexOf(item): a track listed twice in the queue
                  // would resolve both rows to the first index, duplicating
                  // keys and removing/playing the wrong row.
                  const i = queueIndex + 1 + j
                  return (
                    <li
                      key={`${item.id}-${i}`}
                      className="queue-item"
                    >
                      <button
                        type="button"
                        className="queue-item-main"
                        onClick={() => play(item, queue)}
                        // WCAG 2.5.3: the visible title is titleTa-first, so the
                        // accessible name must use the same strings in the same
                        // order (title + artist line) or axe flags a mismatch.
                        aria-label={`${t('common.play')} ${queueItemLabel(item)}`}
                      >
                        <span className="queue-item-cover">
                          {item.cover ? (
                            <img src={item.cover} alt="" loading="lazy" />
                          ) : (
                            <span className="queue-item-cover-fallback" aria-hidden="true">N</span>
                          )}
                        </span>
                        <span className="queue-item-titles">
                          <span className="queue-item-title">
                            {item.titleTa || item.titleEn}
                          </span>
                          <span className="queue-item-artist">
                            {item.artist}
                            {item.titleEn && item.titleTa ? ` · ${item.titleEn}` : ''}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="queue-remove-btn"
                        onClick={() => removeFromQueue(i)}
                        aria-label={`${t('common.removeFromQueue')} ${item.titleTa || item.titleEn}`}
                        title={t('common.removeFromQueue')}
                      >
                        <span aria-hidden="true">✕</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {currentTrack && upNext.length === 0 && userQueue.length === 0 && (
            <p className="queue-empty">
              {radioOn ? t('player.radioWillContinue') : t('player.queueEndsHere')}
            </p>
          )}
        </>
      )}

      <div className="queue-toggles" role="group" aria-label={t('player.queueOptions')}>
        <button
          type="button"
          className={`queue-toggle${smartShuffle ? ' is-active' : ''}`}
          onClick={toggleSmartShuffle}
          aria-pressed={smartShuffle}
        >
          {t('player.smartShuffle')}
        </button>
        <button
          type="button"
          className={`queue-toggle${radioOn ? ' is-active' : ''}`}
          onClick={toggleRadio}
          aria-pressed={radioOn}
        >
          {t('player.autoplay')}
        </button>
      </div>
    </div>
  )
}
