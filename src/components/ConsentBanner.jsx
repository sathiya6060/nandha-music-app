import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'

const CONSENT_KEY = 'nandha-consent'

/**
 * Cookie consent banner (Fix 9). Shown on first visit only; the choice is
 * stored in localStorage under 'nandha-consent'. Declining changes nothing
 * about how the app works — consent only governs optional/marketing
 * cookies, and the app sets none (see /cookies). The banner never blocks
 * the app: it sits above the bottom nav and can be dismissed either way.
 */
export default function ConsentBanner() {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(CONSENT_KEY)) setVisible(true)
    } catch {
      // Storage unavailable — show the banner; the choice just won't persist.
      setVisible(true)
    }
  }, [])

  if (!visible) return null

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
      <p className="consent-banner__text">
        {t('consent.text')}{' '}
        <Link to="/cookies">{t('legal.cookies')}</Link>
        {' · '}
        <Link to="/privacy">{t('legal.privacy')}</Link>
      </p>
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
  )
}
