import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'

/**
 * Public footer (Fix 11). Slim: copyright line + the four legal links.
 * Rendered at the end of the public pages (inside .app-main-wrap, after
 * <main>), so it sits above the fixed bottom nav / mini-player in normal
 * flow and never covers content.
 */
export default function Footer() {
  const { t } = useI18n()
  return (
    <footer className="app-footer">
      <p className="app-footer__copy">{t('footer.copyright')}</p>
      <nav className="app-footer__links" aria-label={t('footer.legal')}>
        <Link to="/privacy">{t('legal.privacy')}</Link>
        <Link to="/terms">{t('legal.terms')}</Link>
        <Link to="/cookies">{t('legal.cookies')}</Link>
        <Link to="/refund">{t('legal.refund')}</Link>
      </nav>
    </footer>
  )
}
