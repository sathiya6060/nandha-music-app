import { usePlayer } from './PlayerContext.jsx'
import './player.css'

/**
 * QueuePanel — the up-next list.
 * Props: { onClose?: () => void } — used by the desktop popover in PlayerBar.
 * Inside MobilePlayer it is rendered inline (no close button needed).
 */
export default function QueuePanel({ onClose }) {
  const {
    track: currentTrack,
    queue,
    queueIndex,
    play,
    removeFromQueue,
    clearQueue,
  } = usePlayer()

  if (queue.length === 0) {
    return (
      <div className="queue-panel">
        <div className="queue-panel-head">
          <h3>Up next</h3>
          {onClose && (
            <button type="button" className="player-icon-btn" onClick={onClose} aria-label="Close queue">
              ✕
            </button>
          )}
        </div>
        <p className="queue-empty">Your queue is empty. Play a song to start one.</p>
      </div>
    )
  }

  const upNext = queue.slice(queueIndex + 1)

  return (
    <div className="queue-panel">
      <div className="queue-panel-head">
        <h3>Up next {upNext.length > 0 ? `(${upNext.length})` : ''}</h3>
        <div className="queue-panel-head-actions">
          <button
            type="button"
            className="queue-clear-btn"
            onClick={clearQueue}
            aria-label="Clear queue"
          >
            Clear
          </button>
          {onClose && (
            <button type="button" className="player-icon-btn" onClick={onClose} aria-label="Close queue">
              ✕
            </button>
          )}
        </div>
      </div>

      <ul className="queue-list">
        {queue.map((item, i) => {
          const isCurrent = i === queueIndex
          const isSample = item.isSample || (!item.audio128 && !item.audio320)
          return (
            <li
              key={`${item.id}-${i}`}
              className={`queue-item ${isCurrent ? 'is-current' : ''}`}
            >
              <button
                type="button"
                className="queue-item-main"
                onClick={() => play(item, queue)}
                aria-label={`Play ${item.titleEn || item.titleTa}`}
                aria-current={isCurrent ? 'true' : undefined}
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
                    {isCurrent && <span className="queue-now-playing" aria-hidden="true">♪ </span>}
                    {item.titleTa || item.titleEn}
                  </span>
                  <span className="queue-item-artist">
                    {item.artist}
                    {item.titleEn && item.titleTa ? ` · ${item.titleEn}` : ''}
                  </span>
                </span>
                {isSample && (
                  <span className="queue-sample-badge">Sample — no audio</span>
                )}
              </button>
              <button
                type="button"
                className="queue-remove-btn"
                onClick={() => removeFromQueue(i)}
                aria-label={`Remove ${item.titleEn || item.titleTa} from queue`}
                title="Remove from queue"
              >
                ✕
              </button>
            </li>
          )
        })}
      </ul>

      {currentTrack && upNext.length === 0 && (
        <p className="queue-empty">Nothing after this track — add more songs to keep playing.</p>
      )}
    </div>
  )
}
