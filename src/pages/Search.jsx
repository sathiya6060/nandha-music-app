import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { tracks as fallbackTracks } from '../data/catalog.js'
import { useTracks, searchTracksIn } from '../lib/supabaseCatalog.js'
import { recordNoResultSearch } from '../lib/adminStore.js'
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
  removeRecentSearch,
} from '../lib/recentSearches.js'
import { usePlayer } from '../player/PlayerContext.jsx'
import TrackRow from '../components/TrackRow.jsx'
import EmptyState, { Skeleton } from '../components/EmptyState.jsx'
import Icon from '../components/Icons.jsx'

const RESULT_CAP = 20
const DEBOUNCE_MS = 300
const TILE_TONES = ['gold', 'slate', 'sand', 'steel']

/**
 * Route '/search'.
 * 300ms debounced input, searchTracksIn() over the Supabase catalog
 * read layer (static catalog fallback), 20-result cap. Zero-result
 * queries are logged via adminStore.recordNoResultSearch (L7: the old
 * inline logger wrote a different shape, so admin Analytics counts
 * stayed 0). Genre chips show when the query is empty. Accepts ?q= and
 * ?genre= deep links. Results count is announced via aria-live.
 */
export default function Search() {
  const { t, tp } = useI18n()
  const player = usePlayer()
  // Item 5 (27 Nov 2026): autoFocus only on fine-pointer devices.
  // On touch (pointer: coarse) autoFocus pops the keyboard the moment
  // the Search tab opens and shoves the content up — focus on tap
  // only. Desktop keeps the current behaviour.
  const [autoFocusSearch] = useState(
    () =>
      typeof window === 'undefined' ||
      !window.matchMedia?.('(pointer: coarse)').matches,
  )
  // Supabase read layer (B1); static catalog is the fallback.
  const { data: sbTracks } = useTracks()
  const allTracks = sbTracks || fallbackTracks
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') || searchParams.get('genre') || ''
  const [query, setQuery] = useState(initialQuery)
  const [debounced, setDebounced] = useState(initialQuery)
  const [searching, setSearching] = useState(false)
  // Recent searches (Spotify batch, 27 Nov 2026 — F-028): persisted
  // locally, clearable, kept in sync via the change event.
  const [recent, setRecent] = useState(() => getRecentSearches())

  useEffect(() => {
    const sync = () => setRecent(getRecentSearches())
    window.addEventListener('nandha-recent-searches-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('nandha-recent-searches-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

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
      const found = searchTracksIn(allTracks, q) || []
      return found.slice(0, RESULT_CAP)
    } catch {
      return []
    }
  }, [debounced, allTracks])

  const genreCounts = useMemo(() => {
    const map = new Map()
    for (const tr of allTracks || []) {
      if (!tr.genre) continue
      map.set(tr.genre, (map.get(tr.genre) || 0) + 1)
    }
    return [...map.entries()]
  }, [allTracks])

  // Record each settled query in recent searches (once per settle —
  // addRecentSearch dedupes + moves to front, so re-runs are harmless).
  useEffect(() => {
    if (!searching && debounced.trim() !== '') addRecentSearch(debounced.trim())
  }, [debounced, searching])

  // Log zero-result queries (once per settled query) for admin analytics.
  const noResults = debounced.trim() !== '' && !searching && results.length === 0
  useEffect(() => {
    if (noResults) recordNoResultSearch(debounced.trim())
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
          autoFocus={autoFocusSearch}
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
        <>
          {recent.length > 0 && (
            <section className="section" aria-label={t('search.recent')}>
              <div className="section-head">
                <div>
                  <h2 className="section-title">{t('search.recent')}</h2>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearRecentSearches}>
                  {t('search.clearRecent')}
                </button>
              </div>
              <div className="chip-row">
                {recent.map((q) => (
                  <span key={q} className="chip chip--with-action">
                    <button
                      type="button"
                      className="chip__label"
                      onClick={() => setQuery(q)}
                    >
                      {q}
                    </button>
                    <button
                      type="button"
                      className="chip__remove"
                      onClick={() => removeRecentSearch(q)}
                      aria-label={`${t('common.remove')}: ${q}`}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </span>
                ))}
              </div>
            </section>
          )}
          <section className="section" aria-label={t('home.browseGenre')}>
            <div className="section-head">
              <div>
                <h2 className="section-title">{t('home.browseGenre')}</h2>
              </div>
            </div>
            {genreCounts.length === 0 ? (
              <span style={{ color: 'var(--muted)' }}>{t('common.noResults')}</span>
            ) : (
              <div className="browse-grid">
                {genreCounts.map(([genre, count], i) => (
                  <button
                    key={genre}
                    type="button"
                    className={`browse-tile browse-tile--${TILE_TONES[i % TILE_TONES.length]}`}
                    onClick={() => setQuery(genre)}
                  >
                    <span className="browse-tile__name">{genre}</span>
                    <span className="browse-tile__count">{tp('album.tracks', count)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      ) : results.length > 0 ? (
        <section className="section" aria-label={t('search.title')}>
          <p aria-live="polite" style={{ color: 'var(--muted)', fontSize: '0.875rem', margin: '0 0 8px' }}>
            {/* Prod sweep (27 Nov 2026): "1 results" was wrong — tp()
                picks the singular form for n === 1. */}
            {tp('search.results', results.length)}
          </p>
          {/* Top-result hero (F-028): the best match, large, with a Play
              button. The full list below INCLUDES the top result again
              (like Spotify): the hero is a summary, the list is where
              like / add-to-queue / play-per-row live — hiding the top
              result from the list would strip those actions from it. */}
          <div className="top-result" aria-label={t('search.topResult')}>
            <span className="top-result__kicker">{t('search.topResult')}</span>
            <div className="top-result__body">
              {results[0].cover ? (
                <img src={results[0].cover} alt="" width={96} height={96} className="top-result__cover" loading="lazy" />
              ) : (
                <span className="cover-placeholder top-result__cover" aria-hidden="true" style={{ width: 96, height: 96, fontSize: '2.5rem', borderRadius: 16 }}>N</span>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="top-result__title" lang={results[0].titleTa ? 'ta' : undefined}>{results[0].titleTa || results[0].titleEn}</p>
                <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
                  {results[0].artist}
                  {results[0].titleEn && results[0].titleTa ? ` · ${results[0].titleEn}` : ''}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => player?.play?.(results[0], results)}
                  >
                    {t('common.play')}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="list-stack" style={{ marginTop: 12 }}>
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
