import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { useTracks } from '../lib/supabaseCatalog.js'
import { buildMix, MIX_IDS } from '../lib/mixes.js'
import { getHiddenIds } from '../lib/hiddenTracks.js'
import { getLikedIds } from '../components/TrackRow.jsx'
import { getFollowedArtistIds } from './Library.jsx'
import { usePlayer } from '../player/PlayerContext.jsx'
import TrackRow from '../components/TrackRow.jsx'
import EmptyState, { Skeleton } from '../components/EmptyState.jsx'
import Icon from '../components/Icons.jsx'

const MIX_META = {
  [MIX_IDS.WEEKLY]: { titleKey: 'mixes.weekly', icon: 'calendar', tone: 'gold' },
  [MIX_IDS.RADAR]: { titleKey: 'mixes.radar', icon: 'radar', tone: 'slate' },
  [MIX_IDS.DAYLIST]: { titleKey: 'mixes.daylist', icon: 'sun', tone: 'sand' },
  [MIX_IDS.DAILY]: { titleKey: 'mixes.daily', icon: 'play', tone: 'gold' },
}

/**
 * Route '/mix/:id' — one rule-based mix (Spotify batch, 27 Nov 2026).
 * The track list is re-derived here from the same buildMix rules the
 * Home hub uses, so the page is shareable and stateless — no location
 * state, no fake data. Unknown ids render the empty state, not a crash.
 */
export default function MixPage() {
  const { lang, t, tp } = useI18n()
  const { id } = useParams()
  const player = usePlayer()
  const meta = MIX_META[id]
  const tracksQuery = useTracks({ publishedOnly: true })
  const tracksList = tracksQuery.data || []

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

  const mix = useMemo(() => {
    if (!meta) return null
    return buildMix(id, tracksList, {
      likedIds: getLikedIds(),
      followedArtistIds: getFollowedArtistIds(),
      hiddenIds: getHiddenIds(),
      // No `date` passed: buildMix defaults to `new Date()` internally,
      // which keeps this render pure (react(purity) flags `new Date()`
      // in the component body).
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tracksList, mixVersion])

  // All hooks above the early returns (rules-of-hooks): `sub` must not
  // sit after `if (!meta) return …`.
  const sub = useMemo(() => {
    if (!mix) return ''
    if (id === MIX_IDS.RADAR) {
      return mix.isFallback
        ? t('mixes.radarLatest')
        : tp('mixes.radarSub', mix.tracks.length)
    }
    if (id === MIX_IDS.WEEKLY) return tp('mixes.weeklySub', mix.tracks.length)
    if (id === MIX_IDS.DAYLIST) {
      // Daylist window title follows the UI language (see Home.jsx).
      return `${mix.window?.[lang === 'ta' ? 'titleTa' : 'titleEn'] || ''} · ${tp('album.tracks', mix.tracks.length)}`
    }
    return tp('album.tracks', mix.tracks.length)
  }, [mix, id, t, tp])

  if (!meta) {
    return (
      <div className="page-head">
        <EmptyState
          title={t('common.noResults')}
          message={t('mixes.empty')}
          action={<Link className="btn btn-primary" to="/">{t('home.forYou')}</Link>}
        />
      </div>
    )
  }

  if (tracksQuery.isLoading) {
    return (
      <div className="page-head">
        <Skeleton width="55%" height={28} />
        <div style={{ marginTop: 8 }}><Skeleton width="40%" height={16} /></div>
      </div>
    )
  }

  const tracks = mix?.tracks || []

  return (
    <div>
      <div className="page-head">
        <div className={`mix-hero mix-card--${meta.tone}`}>
          <span className="mix-hero__glyph" aria-hidden="true">
            <Icon name={meta.icon} size={40} />
          </span>
          <div style={{ minWidth: 0 }}>
            <p className="mix-hero__kicker">{t('mixes.title')}</p>
            <h1 className="page-head__title">{t(meta.titleKey)}</h1>
            <p className="mix-hero__sub">{sub}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={tracks.length === 0}
            onClick={() => tracks.length > 0 && player?.play?.(tracks[0], tracks)}
          >
            {t('common.playAll')}
          </button>
          <Link className="btn btn-ghost" to="/">{t('home.forYou')}</Link>
        </div>
      </div>

      {tracks.length === 0 ? (
        <EmptyState title={t('common.noResults')} message={t('mixes.empty')} />
      ) : (
        <div className="list-stack">
          {tracks.map((track, i) => (
            <TrackRow key={track.id} track={track} index={i} queue={tracks} />
          ))}
        </div>
      )}
    </div>
  )
}
