import { useI18n } from '../lib/i18n.js'
import EmptyState, { Skeleton } from './EmptyState.jsx'

/**
 * Shared loading / load-failed states for the Track, Album and Artist
 * detail pages (M17). One copy instead of three near-identical blocks —
 * SonarQube flagged the triplication as new-code duplication (4.2%
 * on PR #4, over the 3% quality-gate threshold).
 */
export function DetailLoading() {
  const { t } = useI18n()
  return (
    <div>
      <div className="page-head">
        <h1 className="page-head__title">{t('common.loading')}</h1>
      </div>
      <p role="status" style={{ color: 'var(--muted)' }}>{t('common.loading')}</p>
      <Skeleton height={48} />
      <div style={{ marginTop: 8 }}><Skeleton height={48} /></div>
    </div>
  )
}

export function DetailLoadError({ onRetry }) {
  const { t } = useI18n()
  return (
    <div>
      <div className="page-head">
        <h1 className="page-head__title">{t('common.loadFailed')}</h1>
      </div>
      <EmptyState
        title={t('common.loadFailed')}
        action={<button type="button" className="btn btn-primary" onClick={onRetry}>{t('common.retry')}</button>}
      />
    </div>
  )
}
