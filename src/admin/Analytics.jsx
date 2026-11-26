// Analytics — simple bar lists (no chart library).
import { useMemo } from 'react'
import { allTracks } from '../data/catalog.js'
import { getMergedTracks, getNoResultSearches } from '../lib/adminStore.js'
import { useI18n } from '../lib/i18n.js'

// Seeded sample data — replaced by real analytics once wired up.
const SEEDED_DAILY_PLAYS = [
  { day: 'Thu 19 Nov', plays: 84 },
  { day: 'Fri 20 Nov', plays: 132 },
  { day: 'Sat 21 Nov', plays: 210 },
  { day: 'Sun 22 Nov', plays: 176 },
  { day: 'Mon 23 Nov', plays: 148 },
  { day: 'Tue 24 Nov', plays: 193 },
  { day: 'Wed 25 Nov', plays: 241 },
]

const SEEDED_TOP_CITIES = [
  { city: 'Chennai', plays: 486 },
  { city: 'Coimbatore', plays: 212 },
  { city: 'Madurai', plays: 148 },
  { city: 'Bengaluru', plays: 121 },
  { city: 'Tiruchirappalli', plays: 74 },
]

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
  const mergedTracks = useMemo(() => getMergedTracks(allTracks), [])
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
            {t('admin.plays7d')} ({t('common.sample')})
          </h2>
          <BarList items={SEEDED_DAILY_PLAYS} labelKey="day" valueKey="plays" formatValue={formatNumber} />
        </section>
      </div>

      <div className="admin-two-col">
        <section className="admin-panel" aria-labelledby="admin-top-cities">
          <h2 className="admin-panel-title" id="admin-top-cities">
            {t('admin.topCities')} ({t('common.sample')})
          </h2>
          <BarList items={SEEDED_TOP_CITIES} labelKey="city" valueKey="plays" formatValue={formatNumber} />
        </section>

        <section className="admin-panel" aria-labelledby="admin-no-result">
          <h2 className="admin-panel-title" id="admin-no-result">{t('admin.noResultSearches')}</h2>
          {sortedNoResults.length === 0 ? (
            <p className="admin-muted">{t('admin.noResultHint')}</p>
          ) : (
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
          )}
        </section>
      </div>
    </div>
  )
}
