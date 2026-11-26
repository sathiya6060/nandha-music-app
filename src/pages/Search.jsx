import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { searchTracks, tracks } from '../data/catalog.js'
import TrackRow from '../components/TrackRow.jsx'
import EmptyState, { Skeleton } from '../components/EmptyState.jsx'
import Icon from '../components/Icons.jsx'

const NO_RESULT_KEY = 'nandha-no-result-searches'
const RESULT_CAP = 20
const DEBOUNCE_MS = 300

function logNoResult(query) {
  try {
    const raw = localStorage.getItem(NO_RESULT_KEY)
    const list = raw ? JSON.parse(raw) : []
    const arr = Array.isArray(list) ? list : []
    arr.push({ query, at: new Date().toISOString() })
    localStorage.setItem(NO_RESULT_KEY, JSON.stringify(arr.slice(-200)))
  } catch {
    // storage unavailable — skip analytics logging
  }
}

/**
 * Route '/search'.
 * 300ms debounced input, searchTracks(query) from the catalog, 20-result
 * cap. Zero-result queries are logged to localStorage
 * ('nandha-no-result-searches') for admin analytics. Genre chips show
 * when the query is empty. Accepts ?q= and ?genre= deep links.
 * Results count is announced via aria-live.
 */
export default function Search() {
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') || searchParams.get('genre') || ''
  const [query, setQuery] = useState(initialQuery)
  const [debounced, setDebounced] = useState(initialQuery)
  const [searching, setSearching] = useState(false)

  // Keep the input in sync when arriving via a deep link (?q= / ?genre=).
  useEffect(() => {
    setQuery(initialQuery)
    setDebounced(initialQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // 300ms debounce.
  useEffect(() => {
    setSearching(true)
    const timer = setTimeout(() => {
      setDebounced(query)
      setSearching(false)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // The URL ?q= is the single source of truth for the search text, so
  // the top-bar search box follows what is typed here (and vice versa).
  // replace: true keeps typing out of the browser history.
  useEffect(() => {
    const current = searchParams.get('q') || ''
    if (debounced === current) return
    if (debounced.trim() === '') {
      if (current !== '') setSearchParams({}, { replace: true })
    } else {
      setSearchParams({ q: debounced }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const results = useMemo(() => {
    const q = debounced.trim()
    if (!q) return []
    try {
      const found = searchTracks(q) || []
      return found.slice(0, RESULT_CAP)
    } catch {
      return []
    }
  }, [debounced])

  const genres = useMemo(
    () => [...new Set((tracks || []).map((tr) => tr.genre).filter(Boolean))],
    [],
  )

  // Log zero-result queries (once per settled query) for admin analytics.
  const noResults = debounced.trim() !== '' && !searching && results.length === 0
  useEffect(() => {
    if (noResults) logNoResult(debounced.trim())
  }, [noResults, debounced])

  return (
    <div>
      <div className="page-head">
        <h1 className="page-head__title">{t('search.title')}</h1>
      </div>

      <div className="search-box" role="search">
        <span className="search-box__icon" aria-hidden="true"><Icon name="search" size={18} /></span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('common.searchPlaceholder')}
          aria-label={t('common.searchPlaceholder')}
          autoFocus
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t('common.clear')}
            style={{ background: 'none', border: 0, color: 'var(--muted)', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>

      {searching && results.length === 0 && query.trim() !== '' ? (
        // First search only: a skeleton while the debounce settles. Once
        // results exist they stay visible while the next keystroke
        // debounces — no more results/skeleton flicker on every key.
        <div className="section" aria-label={t('common.loading')}>
          <Skeleton height={64} lines={4} />
        </div>
      ) : debounced.trim() === '' ? (
        <section className="section" aria-label={t('home.browseGenre')}>
          <div className="section-head">
            <div>
              <h2 className="section-title">{t('home.browseGenre')}</h2>
            </div>
          </div>
          <div className="chip-row">
            {genres.length === 0 ? (
              <span style={{ color: 'var(--muted)' }}>{t('common.noResults')}</span>
            ) : (
              genres.map((genre) => (
                <button key={genre} type="button" className="chip" onClick={() => setQuery(genre)}>
                  {genre}
                </button>
              ))
            )}
          </div>
        </section>
      ) : results.length > 0 ? (
        <section className="section" aria-label={t('search.title')}>
          <p aria-live="polite" style={{ color: 'var(--muted)', fontSize: '0.875rem', margin: '0 0 8px' }}>
            {t('search.results', { n: results.length })}
          </p>
          <div className="list-stack">
            {results.map((track, i) => (
              <TrackRow key={track.id} track={track} index={i} queue={results} />
            ))}
          </div>
        </section>
      ) : (
        <div className="section">
          <EmptyState
            title={t('search.noResultsLogged', { q: debounced.trim() })}
            message={t('common.tryDifferent')}
            action={<button type="button" className="btn btn-ghost" onClick={() => setQuery('')}>{t('common.clear')}</button>}
          />
        </div>
      )}
    </div>
  )
}
