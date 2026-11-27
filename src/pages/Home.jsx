import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { getDaypart } from '../data/catalog.js'
import {
  useTracks,
  useAlbums,
  useArtists,
  usePlaylists,
  getDaypartTracksFrom,
  getDailyMixFrom,
  getSongOfTheDayFrom,
} from '../lib/supabaseCatalog.js'
import { usePlayer } from '../player/PlayerContext.jsx'
import {
  DEFAULT_ALARM_TIME,
  getStreak,
  isLampLit,
  loadAlarm,
  markDevotionalListen,
} from '../lib/streak.js'
import { shareOrDownloadStoryCard } from '../lib/shareCard.js'
import { buildMix, MIX_IDS } from '../lib/mixes.js'
import { getHiddenIds } from '../lib/hiddenTracks.js'
import { getLikedIds } from '../components/TrackRow.jsx'
import { getFollowedArtistIds } from './Library.jsx'
import Section from '../components/Section.jsx'
import TrackCard from '../components/TrackCard.jsx'
import TrackRow from '../components/TrackRow.jsx'
import EmptyState, { Skeleton } from '../components/EmptyState.jsx'
import Icon from '../components/Icons.jsx'
import { DiscoverFeed } from './Discover.jsx'

const EMPTY_LIST = []

function byReleaseDateDesc(a, b) {
  return String(b.releaseDate || '').localeCompare(String(a.releaseDate || ''))
}

function StreakHero() {
  const { t } = useI18n()
  const player = usePlayer()
  const [streak, setStreak] = useState(() => getStreak())
  // The alarm itself lives in /settings now (item 7) and fires from
  // the app shell (AartiAlarmWatcher) on every route. Home only shows
  // today's alarm time, kept in sync via the change event.
  const [alarm, setAlarm] = useState(() => loadAlarm())
  const markedRef = useRef('')

  useEffect(() => {
    function sync() { setStreak(getStreak()) }
    window.addEventListener('nandha-streak-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('nandha-streak-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  useEffect(() => {
    const onAlarmChange = () => setAlarm(loadAlarm())
    window.addEventListener('nandha-alarm-changed', onAlarmChange)
    return () => window.removeEventListener('nandha-alarm-changed', onAlarmChange)
  }, [])

  // Mark a qualifying devotional listen: current track is Devotional and
  // 30s have played. Counts once per track per day (see streak.js).
  const currentTrack = player?.track ?? player?.current
  const currentTime = player?.currentTime || 0
  useEffect(() => {
    if (!currentTrack || currentTrack.genre !== 'Devotional') return
    if (currentTime < 30) return
    const key = `${currentTrack.id}-${new Date().toDateString()}`
    if (markedRef.current === key) return
    markedRef.current = key
    setStreak(markDevotionalListen())
  }, [currentTrack, currentTime])

  const lamp = isLampLit(streak)

  return (
    <section className="streak-hero" aria-label={t('streak.title')}>
      <div className="streak-hero__top">
        <span className="streak-hero__flame" aria-hidden="true">
          <Icon name="flame" size={36} />
        </span>
        <div>
          <p className="streak-hero__count">{streak.count === 0 ? t('streak.daysZero') : t('streak.days', { n: streak.count })}</p>
          <p className="streak-hero__hint">{t('streak.keepGoing')}</p>
          {lamp && (
            <span className="lamp-badge">
              <Icon name="flame" size={16} /> {t('streak.lampLit')}
            </span>
          )}
        </div>
      </div>
      {/* Item 7: the alarm form moved to /settings; Home only shows
          today's alarm time, with a link to change it. */}
      <p className="streak-hero__hint" style={{ margin: '8px 0 0' }}>
        {t('streak.todayAarti', { time: alarm.time || DEFAULT_ALARM_TIME })}
        {' · '}
        <Link to="/settings">{t('nav.settings')}</Link>
      </p>
    </section>
  )
}

function SongOfTheDay({ tracksList }) {
  const { t } = useI18n()
  const player = usePlayer()
  const [shareState, setShareState] = useState('')
  const [busy, setBusy] = useState(false)
  const song = useMemo(() => getSongOfTheDayFrom(tracksList), [tracksList])
  if (!song) return null

  const lyric = (song.lyricsTa && song.lyricsTa[0]) || song.titleTa || ''
  const isCurrent = (player?.track ?? player?.current)?.id === song.id

  async function handleShare() {
    setBusy(true)
    setShareState(t('share.generating'))
    try {
      const result = await shareOrDownloadStoryCard(song)
      setShareState(result === 'shared' ? t('share.shared') : t('share.downloaded'))
    } catch {
      setShareState(t('common.noResults'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="section" aria-label={t('home.songOfTheDay')}>
      <div className="section-head">
        <div>
          <h2 className="section-title">{t('home.songOfTheDay')}</h2>
        </div>
      </div>
      <div className="sotd-card">
        {song.cover ? (
          <img src={song.cover} alt="" width={96} height={96} style={{ borderRadius: 16, objectFit: 'cover', flexShrink: 0 }} loading="lazy" />
        ) : (
          <span className="cover-placeholder" aria-hidden="true" style={{ width: 96, height: 96, fontSize: '2.5rem', borderRadius: 16 }}>N</span>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          {lyric && <p className="sotd-card__lyric" lang="ta">{lyric}</p>}
          <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
            {song.titleEn || ''} · {song.artist || 'Nandha Music'}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => (isCurrent ? player?.playPause?.() : player?.play?.(song, [song]))}
            >
              {isCurrent && player?.isPlaying ? t('common.pause') : t('common.play')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleShare} disabled={busy}>
              <Icon name="share" size={18} /> {t('home.shareStatus')}
            </button>
          </div>
          {shareState && <p role="status" style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: '0.875rem' }}>{shareState}</p>}
        </div>
      </div>
    </section>
  )
}

/**
 * Made For You hub (Spotify batch, 27 Nov 2026 — PT-001/002/003/004,
 * F-009): rule-based mixes, no ML, no fake data. Weekly Mix refreshes
 * Mondays (ISO week seed), Release Radar refreshes Fridays (21-day
 * fresh window, honest "Latest" label on fallback), Daylist follows
 * the daypart window, Daily Mix is the existing day-seeded rotation.
 * With today's 1-track catalog each mix honestly holds that track.
 */
function MadeForYou({ tracksList }) {
  const { lang, t, tp } = useI18n()
  const player = usePlayer()
  // Rebuild when likes/follows/hides change (mix inputs are localStorage).
  const [mixVersion, setMixVersion] = useState(0)
  useEffect(() => {
    const bump = () => setMixVersion((v) => v + 1)
    window.addEventListener('nandha-hidden-changed', bump)
    window.addEventListener('nandha-liked-changed', bump)
    window.addEventListener('nandha-followed-changed', bump)
    return () => {
      window.removeEventListener('nandha-hidden-changed', bump)
      window.removeEventListener('nandha-liked-changed', bump)
      window.removeEventListener('nandha-followed-changed', bump)
    }
  }, [])

  const mixes = useMemo(() => {
    const hiddenIds = getHiddenIds()
    const likedIds = getLikedIds()
    const followed = getFollowedArtistIds()
    // No `new Date()` here (react(purity)): buildMix defaults to now
    // internally when no `date` is passed.
    const weekly = buildMix(MIX_IDS.WEEKLY, tracksList, { likedIds, hiddenIds })
    const radar = buildMix(MIX_IDS.RADAR, tracksList, { followedArtistIds: followed, hiddenIds })
    const daylist = buildMix(MIX_IDS.DAYLIST, tracksList, { hiddenIds })
    const daily = buildMix(MIX_IDS.DAILY, tracksList, { hiddenIds })
    return [
      {
        ...weekly,
        title: t('mixes.weekly'),
        sub: tp('mixes.weeklySub', weekly.tracks.length),
        icon: 'calendar',
        tone: 'gold',
      },
      {
        ...radar,
        title: t('mixes.radar'),
        sub: radar.isFallback ? t('mixes.radarLatest') : tp('mixes.radarSub', radar.tracks.length),
        icon: 'radar',
        tone: 'slate',
      },
      {
        ...daylist,
        title: t('mixes.daylist'),
        // Daylist window title follows the UI language (titleTa exists
        // for every window — an English-only subtitle in Tamil UI is a
        // localisation gap, not a fallback).
        sub: `${daylist.window?.[lang === 'ta' ? 'titleTa' : 'titleEn'] || ''} · ${tp('album.tracks', daylist.tracks.length)}`,
        icon: 'sun',
        tone: 'sand',
      },
      {
        ...daily,
        title: t('mixes.daily'),
        sub: tp('album.tracks', daily.tracks.length),
        icon: 'play',
        tone: 'gold',
      },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracksList, mixVersion, t, tp])

  return (
    <section className="section" aria-label={t('mixes.title')}>
      <div className="section-head">
        <div>
          <h2 className="section-title">{t('mixes.title')}</h2>
        </div>
      </div>
      <div className="mix-grid">
        {mixes.map((mix) => (
          <article key={mix.id} className={`mix-card mix-card--${mix.tone}`}>
            <Link to={`/mix/${mix.id}`} className="mix-card__link">
              <span className="mix-card__glyph" aria-hidden="true">
                <Icon name={mix.icon} size={28} />
              </span>
              <span className="mix-card__title">{mix.title}</span>
              <span className="mix-card__sub">{mix.sub}</span>
            </Link>
            <button
              type="button"
              className="mix-card__play"
              disabled={mix.tracks.length === 0}
              onClick={() => mix.tracks.length > 0 && player?.play?.(mix.tracks[0], mix.tracks)}
              aria-label={`${t('common.play')}: ${mix.title}`}
            >
              <Icon name="play" size={18} />
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

export default function Home() {
  const { t, tp } = useI18n()
  const navigate = useNavigate()
  const [tab, setTab] = useState('home')

  // Home feed through the Supabase catalog read layer (B1), with the
  // Redis guard (high priority) on the tracks query: memory ->
  // localStorage -> Redis -> Supabase -> static catalog fallback.
  // Search is deliberately NOT wired through Redis — unique queries
  // would burn the budget.
  const tracksQuery = useTracks({ publishedOnly: true, guardKey: 'home' })
  const albumsQuery = useAlbums()
  const artistsQuery = useArtists()
  const playlistsQuery = usePlaylists()

  const isLoading = tracksQuery.isLoading || albumsQuery.isLoading || artistsQuery.isLoading || playlistsQuery.isLoading
  const isError = tracksQuery.isError || albumsQuery.isError || artistsQuery.isError || playlistsQuery.isError

  const homeTracks = tracksQuery.data || EMPTY_LIST
  const player = usePlayer()
  const popularTracks = useMemo(
    () => [...homeTracks].sort((a, b) => (b.plays || 0) - (a.plays || 0)).slice(0, 8),
    [homeTracks],
  )
  const newReleases = useMemo(
    () => [...(albumsQuery.data || [])].sort(byReleaseDateDesc).slice(0, 6),
    [albumsQuery.data],
  )
  const genres = useMemo(
    () => [...new Set(homeTracks.map((tr) => tr.genre).filter(Boolean))].slice(0, 12),
    [homeTracks],
  )
  const featuredArtist = useMemo(() => {
    const list = artistsQuery.data || []
    return list.find((a) => /nandha/i.test(a.name || '')) || list[0] || null
  }, [artistsQuery.data])
  const featuredPlaylistCount = (playlistsQuery.data || []).length

  const daypart = useMemo(() => getDaypart(), [])
  const daypartTracks = useMemo(() => getDaypartTracksFrom(homeTracks), [homeTracks])
  const dailyMix = useMemo(() => getDailyMixFrom(homeTracks), [homeTracks])

  if (isLoading) {
    return (
      <div>
        <div className="page-head">
          <Skeleton width="55%" height={28} />
          <div style={{ marginTop: 8 }}><Skeleton width="40%" height={16} /></div>
        </div>
        <Section title={t('home.popular')}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="track-card"><Skeleton height={140} /><div style={{ marginTop: 10 }}><Skeleton height={16} /></div><div style={{ marginTop: 6 }}><Skeleton width="60%" height={12} /></div></div>
          ))}
        </Section>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="page-head">
        <div className="error-state" role="alert">
          {t('common.loadError')}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-head__title">{t('home.greeting')}</h1>
        <p className="tagline">{t('app.tagline')}</p>
      </div>

      <StreakHero />

      <div className="home-tabs" role="tablist" aria-label={t('home.forYou')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'home'}
          aria-controls="home-panel"
          id="home-tab"
          className="home-tabs__tab"
          onClick={() => setTab('home')}
        >
          {t('home.forYou')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'discover'}
          aria-controls="discover-panel"
          id="discover-tab"
          className="home-tabs__tab"
          onClick={() => setTab('discover')}
        >
          {t('discover.title')}
        </button>
      </div>

      {tab === 'discover' ? (
        <div role="tabpanel" id="discover-panel" aria-labelledby="discover-tab" style={{ marginTop: 12 }}>
          <DiscoverFeed style={{ height: 'min(72dvh, 640px)' }} />
          <p style={{ marginTop: 12 }}>
            <Link className="btn btn-ghost btn-sm" to="/discover">{t('discover.title')} →</Link>
          </p>
        </div>
      ) : (
        <div role="tabpanel" id="home-panel" aria-labelledby="home-tab">
          {homeTracks.length === 0 ? (
            <EmptyState
              title={t('common.noResults')}
              message={t('home.emptyCatalog')}
              action={<Link className="btn btn-primary" to="/search">{t('search.browse')}</Link>}
            />
          ) : (
            <>
              <SongOfTheDay tracksList={homeTracks} />

              <MadeForYou tracksList={homeTracks} />

              {daypartTracks.length > 0 && (
              <section className="section" aria-label={`${daypart.labelTa} · ${daypart.labelEn}`}>
                <div className="section-head">
                  <div>
                    <h2 className="section-title">
                      <span lang="ta">{daypart.labelTa}</span> · {daypart.labelEn}
                    </h2>
                    <p className="section-subtitle">{daypart.genres.join(' · ')}</p>
                  </div>
                </div>
                  <div className="list-stack">
                    {daypartTracks.slice(0, 5).map((track, i) => (
                      <TrackRow key={track.id} track={track} index={i} queue={daypartTracks} />
                    ))}
                  </div>
              </section>
              )}

              <section className="section" aria-label={t('home.dailyMix')}>
                <div className="section-head">
                  <div>
                    <h2 className="section-title">{t('home.dailyMix')}</h2>
                    <p className="section-subtitle">{tp('playlists.tracks', dailyMix.length)}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => dailyMix.length > 0 && player?.play?.(dailyMix[0], dailyMix)}
                    disabled={dailyMix.length === 0}
                  >
                    {t('common.playAll')}
                  </button>
                </div>
                <div className="section-row">
                  {dailyMix.map((track) => (
                    <TrackCard key={track.id} track={track} />
                  ))}
                </div>
              </section>

              <Section title={t('home.popular')} to="/search">
                {popularTracks.map((track) => (
                  <TrackCard key={track.id} track={track} />
                ))}
              </Section>

              <Section title={t('home.newReleases')}>
                {newReleases.length === 0 ? (
                  <EmptyState title={t('common.noResults')} message={t('home.emptyCatalog')} />
                ) : (
                  newReleases.map((album) => (
                    <article className="track-card" key={album.id}>
                      <Link to={`/album/${album.id}`} className="card-link">
                        {album.cover ? (
                          <img className="track-card__cover" src={album.cover} alt="" loading="lazy" width={800} height={800} />
                        ) : (
                          <span className="cover-placeholder track-card__cover" aria-hidden="true" style={{ fontSize: '3rem', aspectRatio: '1', width: '100%', height: 'auto' }}>N</span>
                        )}
                        <h3 className="track-card__title">{album.titleTa || album.title || album.titleEn}</h3>
                        <p className="track-card__artist">{album.artist || 'Nandha Music'} · {album.releaseDate || ''}</p>
                      </Link>
                    </article>
                  ))
                )}
              </Section>

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
                      <button key={genre} type="button" className="chip" onClick={() => navigate(`/search?genre=${encodeURIComponent(genre)}`)}>
                        {genre}
                      </button>
                    ))
                  )}
                </div>
              </section>

              {featuredArtist && (
                <section className="section" aria-label={t('home.featuredArtist')}>
                  <div className="hero-card">
                    {featuredArtist.photo ? (
                      <img src={featuredArtist.photo} alt="" width={96} height={96} style={{ borderRadius: 16, objectFit: 'cover', flexShrink: 0 }} loading="lazy" />
                    ) : (
                      <span className="cover-placeholder" aria-hidden="true" style={{ width: 96, height: 96, fontSize: '2.5rem', borderRadius: 16 }}>N</span>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <h2 className="hero-card__title">{featuredArtist.name}</h2>
                      <p className="hero-card__text">
                        {(featuredArtist.bioEn || featuredArtist.bioTa || '').slice(0, 140)}
                      </p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                        <Link className="btn btn-primary btn-sm" to={`/artist/${featuredArtist.id}`}>{t('common.viewArtist')}</Link>
                        <Link className="btn btn-ghost btn-sm" to="/epk">{t('artist.pressKit')}</Link>
                      </div>
                    </div>
                  </div>
                  <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginTop: 12 }}>
                    {tp('playlists.tracks', featuredPlaylistCount)}
                  </p>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
