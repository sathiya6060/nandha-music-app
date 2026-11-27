import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { usePlayer } from '../player/PlayerContext.jsx'

const CONSENT_KEY = 'nandha-consent'

/**
 * Cookie consent banner (Fix 9). Shown on first visit only; the choice is
 * stored in localStorage under 'nandha-consent'. Declining changes nothing
 * about how the app works — consent only governs optional/marketing
 * cookies, and the app sets none (see /cookies). The banner never blocks
 * the app: it sits above the bottom nav and can be dismissed either way.
 *
 * 27 Nov 2026 (mobile audit, item 1): the old banner was ~220px tall on
 * phones — the text links carried min-height:44px inline-flex, which
 * inflated the text line to 44px, and the text itself was 3 lines. It is
 * now a compact two-row card (≤96px): a short text line, then one row
 * holding the legal links (padded, no min-height) and the Accept/Decline
 * actions. It also hides while the guest gate prompt or a player notice
 * is showing — both sit above the mini-player at a higher z-index and
 * used to cover this banner's Accept button.
 */
export default function ConsentBanner() {
  const { t } = useI18n()
  const { previewEnded, notice } = usePlayer()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(CONSENT_KEY)) setVisible(true)
    } catch {
      // Storage unavailable — show the banner; the choice just won't persist.
      setVisible(true)
    }
  }, [])

  // Never cover (or be covered over) the gate prompt / notice buttons:
  // the prompt lives inside the player bar (z-index 95) above this
  // banner (z-index 90). The banner returns as soon as the prompt or
  // notice clears; the choice is still asked on the next visit if none
  // was made. The notice auto-clears after 4s (PlayerContext).
  if (!visible || previewEnded || notice) return null

  const choose = (value) => {
    try {
      localStorage.setItem(CONSENT_KEY, value)
    } catch {
      /* storage unavailable — the banner simply hides for this visit */
    }
    setVisible(false)
  }

  return (
    <div className="consent-banner" role="region" aria-label={t('consent.title')}>
      <p className="consent-banner__text">{t('consent.text')}</p>
      <div className="consent-banner__row">
        <div className="consent-banner__links">
          <Link to="/cookies">{t('legal.cookiesShort')}</Link>
          <Link to="/privacy" className="consent-banner__links-privacy">{t('legal.privacyShort')}</Link>
        </div>
        <div className="consent-banner__actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => choose('accepted')}
          >
            {t('consent.accept')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => choose('declined')}
          >
            {t('consent.decline')}
          </button>
        </div>
      </div>
    </div>
  )
}
