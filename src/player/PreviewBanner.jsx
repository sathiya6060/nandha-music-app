import { Link } from 'react-router-dom'
import { usePlayer } from './PlayerContext.jsx'
import { useI18n } from '../lib/i18n.js'

/**
 * PreviewBanner — the guest 5s-gate prompt ("Preview ended — Sign in
 * to listen" + "Maybe later"). One component, two placements (prod
 * sweep, 27 Nov 2026 — OCR L2: the markup was duplicated in
 * PlayerBar.jsx and MobilePlayer.jsx):
 * - className="player-preview": the mini-player banner, absolutely
 *   positioned above the bar (inside .player-bar-popups so it stacks
 *   with the player notice instead of overlapping it — OCR L3).
 * - className="player-preview mobile-player-preview": the static
 *   block inside the expanded player sheet.
 * Props: { className: string }.
 */
export default function PreviewBanner({ className }) {
  const { t } = useI18n()
  const { dismissPreviewPrompt } = usePlayer()

  return (
    <div className={className} role="status">
      <span>{t('player.previewEnded')}</span>
      <Link className="player-preview__btn" to="/login">
        {t('player.signInToListen')}
      </Link>
      <button type="button" className="player-preview__dismiss" onClick={dismissPreviewPrompt}>
        {t('player.dismissPreview')}
      </button>
    </div>
  )
}
