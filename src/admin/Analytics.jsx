// Analytics — simple bar lists (no chart library).
import { useMemo } from 'react'
import { tracks } from '../data/catalog.js'
import { useTracks } from '../lib/supabaseCatalog.js'
import { getMergedTracks, getNoResultSearches } from '../lib/adminStore.js'
import { useI18n } from '../lib/i18n.js'

// No seeded analytics: the "Plays (7d)" and "Top cities" panels show
// real data once play events are wired up; until then they show an
// empty state (26 Nov 2026 — dummy data removed per user instruction).

function BarList({ items, labelKey, valueKey, formatValue }) {
  const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0))
  return (
    <ul className="admin-bar-list">
      {items.map((item, i) => {
        const value = Number(item[valueKey]) || 0
        return (
          <li key={item[labelKey] || i} className="admin-bar-row">
            <span className="admin-bar-label">{item[labelKey]}</span>
            <span className="admin-bar-track" aria-hidden="true">
              <span className="admin-bar-fill" style={{ width: `${(value / max) * 100}%` }} />
            </span>
            <span className="admin-bar-value">{formatValue ? formatValue(value) : value}</span>
          </li>
        )
      })}
    </ul>
  )
}

export default function Analytics() {
  const { t, lang } = useI18n()
  // Supabase read layer (B1, all statuses for admin); static catalog +
  // local overrides are the fallback.
  const { data: sbTracks } = useTracks({ publishedOnly: false })
  const mergedTracks = useMemo(() => getMergedTracks(sbTracks || tracks), [sbTracks])
  const noResultSearches = useMemo(() => getNoResultSearches(), [])

  const topTracks = useMemo(
    () =>
      [...mergedTracks]
        .filter((tr) => tr.status !== 'deleted')
        .sort((a, b) => (Number(b.plays) || 0) - (Number(a.plays) || 0))
        .slice(0, 10)
        .map((tr) => ({ label: tr.titleTa || tr.titleEn || tr.id, plays: Number(tr.plays) || 0 })),
    [mergedTracks],
  )

  const sortedNoResults = useMemo(
    () => [...noResultSearches].sort((a, b) => (b.count || 0) - (a.count || 0)),
    [noResultSearches],
  )

  const formatNumber = (v) => Number(v || 0).toLocaleString(lang)

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">{t('admin.analytics')}</h1>
        </div>
      </div>

      <div className="admin-two-col">
        <section className="admin-panel" aria-labelledby="admin-plays-top10">
          <h2 className="admin-panel-title" id="admin-plays-top10">{t('admin.playsTop10')}</h2>
          {topTracks.length === 0 ? (
            <p className="admin-muted">{t('admin.noTracksFound')}</p>
          ) : (
            <BarList items={topTracks} labelKey="label" valueKey="plays" formatValue={formatNumber} />
          )}
        </section>

        <section className="admin-panel" aria-labelledby="admin-plays-7d">
          <h2 className="admin-panel-title" id="admin-plays-7d">
            {t('admin.plays7d')}
          </h2>
          <p className="admin-muted">{t('common.noResults')}</p>
        </section>
      </div>

      <div className="admin-two-col">
        <section className="admin-panel" aria-labelledby="admin-top-cities">
          <h2 className="admin-panel-title" id="admin-top-cities">
            {t('admin.topCities')}
          </h2>
          <p className="admin-muted">{t('common.noResults')}</p>
        </section>

        <section className="admin-panel" aria-labelledby="admin-no-result">
          <h2 className="admin-panel-title" id="admin-no-result">{t('admin.noResultSearches')}</h2>
          {sortedNoResults.length === 0 ? (
            <p className="admin-muted">{t('admin.noResultHint')}</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">{t('common.search')}</th>
                  <th scope="col">{t('admin.timesSearched')}</th>
                  <th scope="col">{t('admin.lastSearched')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedNoResults.map((s) => (
                  <tr key={s.query}>
                    <td>{s.query}</td>
                    <td>{s.count}</td>
                    <td>
                      {s.lastAt
                        ? new Date(s.lastAt).toLocaleDateString(lang, { day: 'numeric', month: 'short' })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
