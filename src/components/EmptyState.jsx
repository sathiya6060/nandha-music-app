import { useI18n } from '../lib/i18n.js'

/**
 * Empty state + loading skeleton.
 * EmptyState props: { title, message, action } — `action` is any React node
 * (usually a button/link). Skeleton renders a shimmer block; pass
 * `lines` for stacked bars.
 */
export default function EmptyState({ title, message, action }) {
  return (
    <div className="empty-state" role="status">
      <p className="empty-state__title">{title}</p>
      {message ? <p className="empty-state__message">{message}</p> : null}
      {action || null}
    </div>
  )
}

export function Skeleton({ width = '100%', height = 16, lines = 1, style }) {
  const { t } = useI18n()
  const bars = Array.from({ length: Math.max(1, lines) }, (_, i) => (
    <div
      key={i}
      className="loading-skeleton"
      style={{ width: i === lines - 1 && lines > 1 ? '70%' : width, height, marginBottom: i < lines - 1 ? 8 : 0, ...style }}
      aria-hidden="true"
    />
  ))
  // Item 12 (27 Nov 2026): the wrapper is positioned so the sr-only
  // "Loading" span (position: absolute) is contained inside the card.
  // Before this, the span's containing block was the initial containing
  // block — inside a horizontal .section-row its static position sat at
  // x≈544 (4th skeleton card) and the 1px span pushed the document's
  // scrollWidth to 546, expanding the layout viewport to 545px on
  // phones while the skeletons showed. position: relative here is a
  // no-op for layout (bars are static); it only contains the span.
  return (
    <div role="status" aria-label={t('common.loading')} style={{ position: 'relative' }}>
      {bars}
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  )
}
