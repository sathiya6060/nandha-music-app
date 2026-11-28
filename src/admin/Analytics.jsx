// Analytics — hand-rolled SVG charts (no chart library, no new
// dependency). Plays over time comes from play_events (admin read
// policy in 001); top tracks from the stored plays counter, which
// the 004 trigger keeps in sync with play_events.
//
// Deliberately absent: "Top cities" — play_events carries no
// location, so there is no city data anywhere; the panel was
// removed rather than fabricated.
import { useEffect, useMemo, useState } from 'react'
import { tracks } from '../data/catalog.js'
import { useTracks } from '../lib/supabaseCatalog.js'
import { supabase } from '../lib/supabase.js'
import { getMergedTracks, getNoResultSearches } from '../lib/adminStore.js'
import { useI18n } from '../lib/i18n.js'
import FallbackBanner from './FallbackBanner.jsx'
import { bucketisePlaysByDay, totalPlays, xLabelAnchor } from './lib/analytics.js'
import './dashboard.css'

const RANGES = [7, 30, 90]

// Line chart: slate line + warm-sand area, amber peak dot.
// Colour-blind-safe two-colour palette (slate + amber only).
function PlaysLineChart({ buckets, formatNumber, lang }) {
  const width = 640
  const height = 220
  const padLeft = 44
  const padRight = 12
  const padTop = 24
  const padBottom = 28
  const max = Math.max(1, ...buckets.map((b) => b.plays))
  const innerW = width - padLeft - padRight
  const innerH = height - padTop - padBottom
  const x = (i) => padLeft + (buckets.length === 1 ? innerW / 2 : (i / (buckets.length - 1)) * innerW)
  const y = (v) => padTop + innerH - (v / max) * innerH
  const points = buckets.map((b, i) => `${x(i).toFixed(1)},${y(b.plays).toFixed(1)}`).join(' ')
  const area = `${padLeft},${padTop + innerH} ${points} ${x(buckets.length - 1).toFixed(1)},${padTop + innerH}`
  const peakIndex = buckets.reduce((best, b, i) => (b.plays > buckets[best].plays ? i : best), 0)
  const peak = buckets[peakIndex]
  // Y gridlines: 0, half, max. X labels: first, middle, last.
  const yTicks = [0, Math.round(max / 2), max]
  const xLabels = [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  )
  const shortDate = (iso) => {
    try {
      return new Date(`${iso}T00:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short' })
    } catch {
      return iso
    }
  }
  return (
    <div className="dash-chart-wrap">
      <svg
        className="dash-line-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${buckets.length}-day plays chart, ${formatNumber(totalPlays(buckets))} plays total`}
      >
        <title>{`Plays per day — ${formatNumber(totalPlays(buckets))} total`}</title>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              className="dash-grid-line"
              x1={padLeft}
              x2={width - padRight}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="dash-axis-label" x={padLeft - 6} y={y(tick) + 4} textAnchor="end">
              {formatNumber(tick)}
            </text>
          </g>
        ))}
        <polygon className="dash-area" points={area} />
        <polyline className="dash-line" points={points} />
        {buckets.map((b, i) => (
          <circle key={b.date} className="dash-point" cx={x(i)} cy={y(b.plays)} r="3.5">
            <title>{`${shortDate(b.date)}: ${formatNumber(b.plays)} plays`}</title>
          </circle>
        ))}
        {peak.plays > 0 && (
          <text className="dash-value-label" x={x(peakIndex)} y={y(peak.plays) - 10} textAnchor="middle">
            {formatNumber(peak.plays)}
          </text>
        )}
        {xLabels.map((i) => (
          <text key={buckets[i].date} className="dash-axis-label" x={x(i)} y={height - 8} textAnchor={xLabelAnchor(i, buckets.length)}>
            {shortDate(buckets[i].date)}
          </text>
        ))}
      </svg>
    </div>
  )
}

function BarList({ items, formatValue }) {
  const max = Math.max(1, ...items.map((i) => Number(i.plays) || 0))
  return (
    <div>
      <ul className="admin-bar-list">
        {items.map((item, i) => {
          const value = Number(item.plays) || 0
          return (
            <li key={item.label || i} className="admin-bar-row">
              <span className="admin-bar-label">{item.label}</span>
              <span className="admin-bar-track" aria-hidden="true">
                <span className="admin-bar-fill" style={{ width: `${(value / max) * 100}%` }} />
              </span>
              <span className="admin-bar-value">{formatValue ? formatValue(value) : value}</span>
            </li>
          )
        })}
      </ul>
      <div className="dash-bar-axis" aria-hidden="true">
        <span>0</span>
        <span>{formatValue ? formatValue(max) : max}</span>
      </div>
    </div>
  )
}

function DataTable({ caption, columns, rows }) {
  return (
    <details className="dash-chart-fallback">
      <summary>{caption}</summary>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.key || i}>
                {row.cells.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export default function Analytics() {
  const { t, lang } = useI18n()
  // Supabase read layer (B1, all statuses for admin); static catalog +
  // local overrides are the fallback.
  const { data: sbTracks, isLoading: tracksLoading, refetch: refetchTracks } = useTracks({ publishedOnly: false })
  const mergedTracks = useMemo(() => getMergedTracks(sbTracks || tracks), [sbTracks])
  const noResultSearches = useMemo(() => getNoResultSearches(), [])
  const [rangeDays, setRangeDays] = useState(7)
  // null = not loaded / query failed; [] = loaded, no plays in range.
  const [playEvents, setPlayEvents] = useState(null)

  useEffect(() => {
    if (!supabase) return undefined
    let cancelled = false
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString()
    void supabase
      .from('play_events')
      .select('played_at, count, track_id')
      .gte('played_at', since)
      .then(({ data, error }) => {
        if (!cancelled && !error) setPlayEvents(Array.isArray(data) ? data : [])
      })
    return () => {
      cancelled = true
    }
  }, [rangeDays])

  const buckets = useMemo(
    () => (playEvents ? bucketisePlaysByDay(playEvents, rangeDays) : []),
    [playEvents, rangeDays],
  )
  const hasPlays = totalPlays(buckets) > 0

  const topTracks = useMemo(
    () =>
      [...mergedTracks]
        .filter((tr) => tr.status !== 'deleted')
        .sort((a, b) => (Number(b.plays) || 0) - (Number(a.plays) || 0))
        .slice(0, 10)
        .map((tr) => ({ label: tr.titleTa || tr.titleEn || tr.id, plays: Number(tr.plays) || 0 })),
    [mergedTracks],
  )
  const topTracksMax = Math.max(1, ...topTracks.map((tr) => tr.plays))

  const sortedNoResults = useMemo(
    () => [...noResultSearches].sort((a, b) => (b.count || 0) - (a.count || 0)),
    [noResultSearches],
  )

  const formatNumber = (v) => Number(v || 0).toLocaleString(lang)
  const rangeKey = rangeDays === 7 ? 'admin.range7d' : rangeDays === 30 ? 'admin.range30d' : 'admin.range90d'

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">{t('admin.analytics')}</h1>
        </div>
      </div>

      <FallbackBanner
        loading={tracksLoading}
        onRetry={() => void refetchTracks()}
      />

      <section className="admin-panel" aria-labelledby="admin-plays-over-time">
        <h2 className="admin-panel-title" id="admin-plays-over-time">{t('admin.playsOverTime')}</h2>
        <div className="dash-range-chips" role="group" aria-label={t('admin.playsOverTime')}>
          {RANGES.map((days) => (
            <button
              key={days}
              type="button"
              className="dash-range-chip"
              aria-pressed={rangeDays === days}
              onClick={() => setRangeDays(days)}
            >
              {t(days === 7 ? 'admin.range7d' : days === 30 ? 'admin.range30d' : 'admin.range90d')}
            </button>
          ))}
        </div>
        {playEvents === null ? (
          <p className="admin-muted">{t('common.loading')}</p>
        ) : !hasPlays ? (
          <p className="admin-muted">{t('admin.noPlaysYet')}</p>
        ) : (
          <>
            <p className="admin-muted">
              {formatNumber(totalPlays(buckets))} {t('admin.plays')} · {t(rangeKey)}
            </p>
            <PlaysLineChart buckets={buckets} formatNumber={formatNumber} lang={lang} />
            <DataTable
              caption={t('admin.dataTable')}
              columns={[t('admin.releaseDate'), t('admin.plays')]}
              rows={buckets.map((b) => ({
                key: b.date,
                cells: [
                  new Date(`${b.date}T00:00:00`).toLocaleDateString(lang, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  }),
                  formatNumber(b.plays),
                ],
              }))}
            />
          </>
        )}
      </section>

      <div className="admin-two-col">
        <section className="admin-panel" aria-labelledby="admin-plays-top10">
          <h2 className="admin-panel-title" id="admin-plays-top10">{t('admin.playsTop10')}</h2>
          {topTracks.length === 0 || topTracksMax <= 0 ? (
            <p className="admin-muted">{t('admin.noPlaysYet')}</p>
          ) : (
            <>
              <BarList items={topTracks} formatValue={formatNumber} />
              <DataTable
                caption={t('admin.dataTable')}
                columns={[t('admin.title'), t('admin.plays')]}
                rows={topTracks.map((tr) => ({ key: tr.label, cells: [tr.label, formatNumber(tr.plays)] }))}
              />
            </>
          )}
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
