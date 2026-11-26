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
  return (
    <div role="status" aria-label={t('common.loading')}>
      {bars}
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  )
}
