import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { queryClientOptions } from '../lib/cache.js'
import { cachedFetch } from '../lib/redisGuard.js'
import {
  REAL_TRACK_ID,
  albums,
  artists,
  getDailyMix,
  getDaypart,
  getDaypartTracks,
  getSongOfTheDay,
  getTrack,
  playlists,
  tracks,
} from '../data/catalog.js'
import { usePlayer } from '../player/PlayerContext.jsx'
import {
  DEFAULT_ALARM_TIME,
  getStreak,
  isLampLit,
  loadAlarm,
  markAartiFired,
  markDevotionalListen,
  saveAlarm,
  shouldFireAarti,
} from '../lib/streak.js'
import { shareOrDownloadStoryCard } from '../lib/shareCard.js'
import Section from '../components/Section.jsx'
import TrackCard from '../components/TrackCard.jsx'
import TrackRow from '../components/TrackRow.jsx'
import EmptyState, { Skeleton } from '../components/EmptyState.jsx'
import Icon from '../components/Icons.jsx'
import { DiscoverFeed } from './Discover.jsx'

const STALE_TIME = 5 * 60 * 1000 // 5 minutes — in-memory React Query cache
// Shared React Query defaults from the 5-layer cache module (layer 4).
const QUERY_DEFAULTS = queryClientOptions?.defaultOptions?.queries ?? {}

function byReleaseDateDesc(a, b) {
  return String(b.releaseDate || '').localeCompare(String(a.releaseDate || ''))
}

function StreakHero() {
  const { t } = useI18n()
  const player = usePlayer()
  const [streak, setStreak] = useState(() => getStreak())
  const [alarm, setAlarm] = useState(() => loadAlarm())
  const [alarmTime, setAlarmTime] = useState(alarm.time || DEFAULT_ALARM_TIME)
  const [alarmTrackId, setAlarmTrackId] = useState(alarm.trackId || REAL_TRACK_ID)
  const [alarmMsg, setAlarmMsg] = useState('')
  const [notifState, setNotifState] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  )
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

  // Aarti alarm: fires while the app/tab is open at the alarm time.
  // (True background alarms need a push server — P2; see streak.js.)
  useEffect(() => {
    const id = setInterval(() => {
      if (!shouldFireAarti(alarm)) return
      markAartiFired()
      const song = (alarm.trackId && getTrack(alarm.trackId)) || getTrack(REAL_TRACK_ID)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && song) {
        try {
          new Notification('Nandha Music', {
            body: `${song.titleTa || song.titleEn || ''} — ${t('streak.aartiAlarm')}`,
          })
        } catch {
          // notifications blocked — playback below still runs
        }
      }
      if (song) player?.play?.(song, [song])
    }, 30000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarm])

  function saveAartiAlarm(e) {
    e.preventDefault()
    const next = { time: alarmTime, trackId: alarmTrackId }
    saveAlarm(next)
    setAlarm(next)
    setAlarmMsg(t('streak.alarmSaved'))
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') return
    const result = await Notification.requestPermission()
    setNotifState(result)
  }

  const devotionalTracks = useMemo(
    () => tracks.filter((tr) => tr.genre === 'Devotional' && tr.status === 'published').slice(0, 12),
    [],
  )
  const lamp = isLampLit(streak)

  return (
    <section className="streak-hero" aria-label={t('streak.title')}>
      <div className="streak-hero__top">
        <span className="streak-hero__flame" aria-hidden="true">
          <Icon name="flame" size={36} />
        </span>
        <div>
          <p className="streak-hero__count">{t('streak.days', { n: streak.count })}</p>
          <p className="streak-hero__hint">{t('streak.keepGoing')}</p>
          {lamp && (
            <span className="lamp-badge">
              <Icon name="flame" size={16} /> {t('streak.lampLit')}
            </span>
          )}
        </div>
      </div>
      <form className="streak-hero__alarm" onSubmit={saveAartiAlarm}>
        <h3>{t('streak.aartiAlarm')}</h3>
        <p className="streak-hero__hint" style={{ margin: 0 }}>
          {t('streak.todayAarti', { time: alarm.time || DEFAULT_ALARM_TIME })}
        </p>
        <div className="streak-hero__alarm-row">
          <div className="streak-hero__field">
            <label htmlFor="aarti-time">{t('streak.alarmTime')}</label>
            <input
              id="aarti-time"
              className="input"
              type="time"
              value={alarmTime}
              onChange={(e) => setAlarmTime(e.target.value)}
            />
          </div>
          <div className="streak-hero__field" style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="aarti-song">{t('streak.alarmSong')}</label>
            <select
              id="aarti-song"
              className="input"
              value={alarmTrackId}
              onChange={(e) => setAlarmTrackId(e.target.value)}
            >
              {devotionalTracks.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.titleTa || tr.titleEn} — {tr.artist}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary">{t('common.save')}</button>
          {notifState !== 'granted' && notifState !== 'unsupported' && (
            <button type="button" className="btn btn-ghost" onClick={enableNotifications}>
              {t('streak.enableNotifications')}
            </button>
          )}
        </div>
        <p className="streak-hero__hint" style={{ marginTop: 8 }}>{t('streak.alarmNote')}</p>
        {alarmMsg && <p role="status" className="streak-hero__hint">{alarmMsg}</p>}
      </form>
    </section>
  )
}

function SongOfTheDay() {
  const { t } = useI18n()
  const player = usePlayer()
  const [shareState, setShareState] = useState('')
  const [busy, setBusy] = useState(false)
  const song = useMemo(() => getSongOfTheDay(), [])
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

export default function Home() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [tab, setTab] = useState('home')

  // Home feed through the Redis guard (high priority): memory ->
  // localStorage -> Redis -> static catalog. Search is deliberately
  // NOT wired through Redis — unique queries would burn the budget.
  const tracksQuery = useQuery({
    queryKey: ['catalog', 'tracks'],
    queryFn: async () =>
      cachedFetch('home', async () => tracks, { ttlSeconds: 600, priority: 'high' }),
    ...QUERY_DEFAULTS,
    staleTime: STALE_TIME,
  })
  const albumsQuery = useQuery({
    queryKey: ['catalog', 'albums'],
    queryFn: async () => albums,
    ...QUERY_DEFAULTS,
    staleTime: STALE_TIME,
  })
  const artistsQuery = useQuery({
    queryKey: ['catalog', 'artists'],
    queryFn: async () => artists,
    ...QUERY_DEFAULTS,
    staleTime: STALE_TIME,
  })
  const playlistsQuery = useQuery({
    queryKey: ['catalog', 'playlists'],
    queryFn: async () => playlists,
    ...QUERY_DEFAULTS,
    staleTime: STALE_TIME,
  })

  const isLoading = tracksQuery.isLoading || albumsQuery.isLoading || artistsQuery.isLoading || playlistsQuery.isLoading
  const isError = tracksQuery.isError || albumsQuery.isError || artistsQuery.isError || playlistsQuery.isError

  const homeTracks = tracksQuery.data || []
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
  const daypartTracks = useMemo(() => getDaypartTracks(), [])
  const dailyMix = useMemo(() => getDailyMix(), [])

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
              <SongOfTheDay />

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
                    <p className="section-subtitle">{t('playlists.tracks', { n: dailyMix.length })}</p>
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
                      <Link to={`/album/${album.id}`} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
                        {album.cover ? (
                          <img className="track-card__cover" src={album.cover} alt="" loading="lazy" />
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
                    {t('playlists.tracks', { n: featuredPlaylistCount })}
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
