import { Link } from 'react-router-dom'

/**
 * Shared layout for the legal pages (/privacy, /terms, /cookies, /refund).
 * English is the governing version; each page carries a short Tamil
 * summary for convenience — the Tamil text is a summary, not a
 * translation of the legal terms.
 */
export default function LegalPage({ title, updated, tamilSummary, children }) {
  return (
    <div className="page legal-page">
      <div className="page-head">
        <h1 className="page-head__title">{title}</h1>
        <p className="page-head__sub">{updated}</p>
      </div>
      <p className="legal-governing">
        The English version of this page is the governing version. The Tamil
        summary below is provided for convenience only.
      </p>
      <div className="legal-tamil" lang="ta">
        <h2>சுருக்கம்</h2>
        <p>{tamilSummary}</p>
      </div>
      <div className="legal-body">{children}</div>
      <p className="legal-contact">
        Questions about this policy? Write to{' '}
        <a href="mailto:officialnandhamusic@gmail.com">officialnandhamusic@gmail.com</a>.
      </p>
      <nav className="legal-nav" aria-label="Legal pages">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms &amp; Conditions</Link>
        <Link to="/cookies">Cookie Policy</Link>
        <Link to="/refund">Refund Policy</Link>
      </nav>
    </div>
  )
}
