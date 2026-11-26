import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'

/**
 * Section header + content row.
 * Props: { title, subtitle, children, to }
 * `to` adds a "See all" link. Children render in a horizontal scroll row
 * on mobile and a grid on desktop (see .section-row in theme.css).
 */
export default function Section({ title, subtitle, children, to }) {
  const { t } = useI18n()
  return (
    <section className="section" aria-label={typeof title === 'string' ? title : undefined}>
      <div className="section-head">
        <div>
          <h2 className="section-title">{title}</h2>
          {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
        </div>
        {to ? <Link className="section-link" to={to}>{t('common.seeAll')} →</Link> : null}
      </div>
      <div className="section-row">{children}</div>
    </section>
  )
}
