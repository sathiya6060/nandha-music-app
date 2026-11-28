import { usePlayer } from './PlayerContext.jsx'
import { useI18n } from '../lib/i18n.js'
import { SLEEP_OPTIONS_MINUTES, formatSleepRemaining, loadSleepDefault } from '../lib/sleepTimer.js'
import Icon from '../components/Icons.jsx'

/**
 * SleepTimerSheet (Spotify batch, 27 Nov 2026 — PT-014 / F-023):
 * stop playback after 5/10/15/30/60 minutes, or at the end of the
 * current track. The countdown itself lives in PlayerContext (a
 * setTimeout that calls stopPlayback; end-of-track stops in onEnded).
 * Rendered as a bottom sheet over the player, with a backdrop.
 * Props: { open: boolean, onClose: () => void }.
 */
export default function SleepTimerSheet({ open, onClose }) {
  const { t } = useI18n()
  const { sleepTimer, sleepRemainingSec, setSleepTimer, clearSleepTimer } = usePlayer()

  if (!open) return null

  const active = sleepTimer?.mode === 'minutes' ? sleepTimer.minutes : sleepTimer?.mode === 'end-of-track' ? 'end-of-track' : null
  // Item 7: the /settings sleep default — highlighted here (as a tag)
  // when no timer is running. It never starts a timer on its own.
  const sleepDefault = loadSleepDefault()
  const defaultTag = (value) => (!sleepTimer && sleepDefault === value ? (
    <span className="sleep-option__default">{t('settings.sleepDefaultTag')}</span>
  ) : null)

  return (
    // S6848: the backdrop is a click-to-close surface — give it the
    // button role + label (Escape also closes; see MobilePlayer).
    // S6852: a button-role surface must be tabbable AND operable —
    // Enter/Space closes it too.
    <div
      className="sheet-backdrop"
      role="button"
      tabIndex={0}
      aria-label={t('common.close')}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClose()
        }
      }}
    >
      <div
        className="sheet sleep-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('player.sleepTimer')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2 className="sheet-title">
            <Icon name="moon" size={20} /> {t('player.sleepTimer')}
          </h2>
          <button type="button" className="player-icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="close" size={20} />
          </button>
        </div>
        {sleepTimer && (
          <p role="status" className="sleep-sheet__status">
            {sleepTimer.mode === 'minutes'
              ? t('player.sleepRemaining', { time: formatSleepRemaining(sleepRemainingSec * 1000) })
              : t('player.sleepEndsTrack')}
          </p>
        )}
        <ul className="sleep-options">
          <li>
            <button
              type="button"
              className={`sleep-option${active === null ? ' is-active' : ''}`}
              onClick={() => { clearSleepTimer(); onClose() }}
              aria-pressed={active === null}
            >
              {t('player.sleepOff')}
              {defaultTag('off')}
            </button>
          </li>
          {SLEEP_OPTIONS_MINUTES.map((min) => (
            <li key={min}>
              <button
                type="button"
                className={`sleep-option${active === min ? ' is-active' : ''}`}
                onClick={() => { setSleepTimer(min); onClose() }}
                aria-pressed={active === min}
              >
                {t('player.sleepSet', { n: min })}
                {defaultTag(min)}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className={`sleep-option${active === 'end-of-track' ? ' is-active' : ''}`}
              onClick={() => { setSleepTimer('end-of-track'); onClose() }}
              aria-pressed={active === 'end-of-track'}
            >
              {t('player.sleepEndOfTrack')}
              {defaultTag('end')}
            </button>
          </li>
        </ul>
      </div>
    </div>
  )
}
