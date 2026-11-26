import { useMemo, useState } from 'react'
import { useI18n } from '../lib/i18n.js'
import { tracks as fallbackTracks } from '../data/catalog.js'
import { useTracks } from '../lib/supabaseCatalog.js'
import TrackRow from '../components/TrackRow.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Icon from '../components/Icons.jsx'
import { usePlayer } from '../player/PlayerContext.jsx'

const CONTACT_EMAIL = 'officialnandhamusic@gmail.com'
const VAAZHVINIL_COVER = '/assets/vaazhvinil-cover.jpg'
const LOGO = '/assets/nandha-logo.png'
const LOCKUP = '/assets/nandha-lockup.png'

const SOCIAL_LINKS = [
  { label: 'Instagram', url: 'https://www.instagram.com/nandhamusic.official', note: '@nandhamusic.official' },
  { label: 'YouTube', url: 'https://youtube.com/@officialnandhamusic', note: '@officialnandhamusic' },
  { label: 'Facebook', url: 'https://www.facebook.com/profile.php?id=61596981507074', note: 'Nandha Music Page' },
  { label: 'Threads', url: 'https://www.threads.com/@officialnandhamusic', note: '@officialnandhamusic' },
]

const STREAMING_LINKS = [
  { label: 'Spotify', url: 'https://open.spotify.com/search/Nandha%20Music', note: 'Search “Nandha Music” on Spotify' },
  { label: 'JioSaavn', url: 'https://www.jiosaavn.com/search/Nandha%20Music', note: 'Search “Nandha Music” on JioSaavn' },
  { label: 'YouTube Music', url: 'https://youtube.com/@officialnandhamusic', note: '@officialnandhamusic' },
]

const VIDEOS = [
  { title: 'Vaazhvinil Orumurayenum — Lyric Video', note: 'Watch on YouTube — youtube.com/@officialnandhamusic', url: 'https://youtube.com/@officialnandhamusic' },
  { title: 'Marakka Mudiyuma — Official Video', note: 'Watch on YouTube — youtube.com/@officialnandhamusic', url: 'https://youtube.com/@officialnandhamusic' },
  { title: 'Annamalaiyar — Devotional Lyric Video', note: 'Watch on YouTube — youtube.com/@officialnandhamusic', url: 'https://youtube.com/@officialnandhamusic' },
]

function buildPressKitText(bestTracks) {
  const lines = [
    'NANDHA MUSIC — ELECTRONIC PRESS KIT',
    '=====================================',
    '',
    'ABOUT (ENGLISH)',
    'Nandha Music is an independent Tamil music label for melody, love and',
    'devotional songs — new songs as they release. The label blends classic Tamil',
    'melody with modern production, from romantic melodies to devotional songs',
    'for Lord Shiva and the Siddhars.',
    '',
    'ABOUT (TAMIL)',
    'நந்தா மியூசிக் — மெலடி, காதல் மற்றும் பக்திப் பாடல்களுக்கான ஒரு தமிழ்',
    'இசை நிறுவனம். புதிய பாடல்கள் வெளியாகும்போது.',
    '',
    'CURRENT RELEASE',
    'Vaazhvinil Orumurayenum — Single',
    'Release date: 10 Dec 2026',
    'Composer: Siddha Guruji',
    'Distributed via RouteNote.',
    '',
    'BEST TRACKS',
    ...bestTracks.map((tr, i) => `${i + 1}. ${tr.titleTa || tr.titleEn || ''} — ${tr.artist || 'Nandha Music'}`),
    '',
    'HIGHLIGHTS (as stated by the label)',
    '- 40-song catalog (devotional, love & melody)',
    '- Released via RouteNote to Spotify, JioSaavn and more',
    '- Goal: 1,000 app users',
    '',
    'SOCIAL & STREAMING',
    ...SOCIAL_LINKS.map((s) => `${s.label}: ${s.url}`),
    ...STREAMING_LINKS.map((s) => `${s.label}: ${s.url}`),
    '',
    `CONTACT: ${CONTACT_EMAIL}`,
    'Instagram: https://www.instagram.com/nandhamusic.official',
    'YouTube: https://youtube.com/@officialnandhamusic',
    '',
    'Generated from nandha music app EPK page.',
  ]
  return lines.join('\n')
}

/**
 * Route '/epk' — PUBLIC Electronic Press Kit, no login required.
 * All UI labels/buttons come from t(); the bio paragraphs and highlight
 * facts are authored press copy (Tamil-first, Tamil + English) and the
 * track/video titles are proper nouns from the catalog.
 */
export default function EPK() {
  const { t } = useI18n()
  const player = usePlayer()
  const [downloaded, setDownloaded] = useState(false)
  // Supabase read layer (B1); static catalog is the fallback.
  const { data: sbTracks } = useTracks()
  const tracks = sbTracks || fallbackTracks

  const bestTracks = useMemo(() => {
    const sorted = [...(tracks || [])].sort((a, b) => (b.plays || 0) - (a.plays || 0))
    const top = sorted.slice(0, 5)
    // Make sure the current release is featured when it is in the catalog.
    const vaazh = sorted.find((tr) => /vaazhvinil/i.test(`${tr.titleEn || ''} ${tr.titleTa || ''}`))
    if (vaazh && !top.some((tr) => tr.id === vaazh.id)) top.unshift(vaazh)
    return top.slice(0, 5)
  }, [tracks])

  const currentRelease = useMemo(
    () => (tracks || []).find((tr) => /vaazhvinil/i.test(`${tr.titleEn || ''} ${tr.titleTa || ''}`)),
    [tracks],
  )

  function downloadPressKit() {
    const text = buildPressKitText(bestTracks)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'nandha-music-press-kit.txt'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setDownloaded(true)
  }

  return (
    <div>
      <div className="page-head">
        <p className="badge" style={{ marginBottom: 8 }}>{t('epk.title')}</p>
        <h1 className="page-head__title">Nandha Music</h1>
        <p className="tagline">{t('app.tagline')}</p>
      </div>

      <section className="section" aria-label={t('epk.bio')}>
        <div className="hero-card" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
          <img src={LOGO} alt="Nandha Music logo" width={72} height={72} style={{ borderRadius: 14 }} />
          <div>
            <p lang="ta" style={{ margin: '0 0 10px', fontSize: '1.05rem' }}>
              நந்தா மியூசிக் — மெலடி, காதல் மற்றும் பக்திப் பாடல்களுக்கான ஒரு தமிழ் இசை
              நிறுவனம். புதிய பாடல்கள் வெளியாகும்போது. சித்தர் பாடல்கள், சிவன் பாடல்கள்,
              காதல் மெலடிகள் — இசையில் உணர்வும் பக்தியும்.
            </p>
            <p style={{ margin: 0, color: 'var(--muted)' }}>
              Nandha Music is an independent Tamil music label for melody, love and devotional
              songs — new songs as they release. From romantic melodies to devotional songs for
              Lord Shiva and the Siddhars, the label blends classic Tamil melody with modern
              production.
            </p>
          </div>
        </div>
      </section>

      <section className="section" aria-label={t('epk.currentRelease')}>
        <div className="section-head">
          <div>
            <h2 className="section-title">{t('epk.currentRelease')}</h2>
          </div>
        </div>
        <div className="hero-card">
          <img
            className="epk-photo"
            src={currentRelease?.cover || VAAZHVINIL_COVER}
            alt="Vaazhvinil Orumurayenum cover art"
            width={140}
            height={140}
            style={{ objectFit: 'cover', flexShrink: 0 }}
          />
          <div style={{ minWidth: 0 }}>
            <h3 className="hero-card__title">Vaazhvinil Orumurayenum</h3>
            <p className="hero-card__text">வாழ்வினில் ஒருமுறையெனும் — Single · Release date: 10 Dec 2026</p>
            <p className="hero-card__text">Composer: Siddha Guruji · Distributed via RouteNote</p>
            {currentRelease && (
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => player?.play?.(currentRelease, [currentRelease])}
                >
                  {t('epk.listen')}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section" aria-label={t('epk.music')}>
        <div className="section-head">
          <div><h2 className="section-title">{t('epk.music')}</h2></div>
        </div>
        <div className="grid-cards">
          <figure style={{ margin: 0 }}>
            <img className="epk-photo" src={VAAZHVINIL_COVER} alt="Vaazhvinil Orumurayenum cover art" loading="lazy" width={3000} height={3000} />
            <figcaption style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 6 }}>Vaazhvinil Orumurayenum — cover art</figcaption>
          </figure>
          <figure style={{ margin: 0 }}>
            <img className="epk-photo" src={LOGO} alt="Nandha Music logo" loading="lazy" style={{ background: 'var(--surface)', padding: 24 }} />
            <figcaption style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 6 }}>Nandha Music — logo</figcaption>
          </figure>
          <figure style={{ margin: 0 }}>
            <img className="epk-photo" src={LOCKUP} alt="Nandha Music lockup — N logo followed by NANDHA MUSIC" loading="lazy" style={{ background: 'var(--white)', padding: 16 }} />
            <figcaption style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 6 }}>Nandha Music — official lockup</figcaption>
          </figure>
        </div>
      </section>

      <section className="section" aria-label={t('epk.music')}>
        <div className="section-head">
          <div>
            <h2 className="section-title">{t('home.topTracks')}</h2>
          </div>
        </div>
        {bestTracks.length === 0 ? (
          <EmptyState title={t('common.noResults')} message={t('home.emptyCatalog')} />
        ) : (
          <div className="list-stack">
            {bestTracks.map((track, i) => (
              <TrackRow key={track.id} track={track} index={i} queue={bestTracks} />
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-label={t('epk.videos')}>
        <div className="section-head">
          <div>
            <h2 className="section-title">{t('epk.videos')}</h2>
          </div>
        </div>
        <div className="grid-cards">
          {VIDEOS.map((v) => (
            <div className="video-card" key={v.title}>
              <p className="video-card__title">{v.title}</p>
              <p className="video-card__text">{v.note}</p>
              <a className="btn btn-ghost btn-sm" href={v.url} target="_blank" rel="noreferrer" style={{ marginTop: 12 }}>
                {t('epk.listen')} ↗
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="section" aria-label={t('epk.highlights')}>
        <div className="section-head">
          <div><h2 className="section-title">{t('epk.highlights')}</h2></div>
        </div>
        <div className="card-light">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>40-song catalog — devotional, love &amp; melody (as stated by the label)</li>
            <li>Released via RouteNote to Spotify, JioSaavn and more (as stated by the label)</li>
            <li>Goal: 1,000 app users (as stated by the label)</li>
            <li>New songs as they release — Instagram, Facebook, YouTube &amp; Threads</li>
          </ul>
        </div>
      </section>

      <section className="section" aria-label={t('epk.follow')}>
        <div className="section-head">
          <div><h2 className="section-title">{t('epk.follow')}</h2></div>
        </div>
        <ul className="link-list">
          {SOCIAL_LINKS.map((s) => (
            <li key={s.label}>
              <a href={s.url} target="_blank" rel="noreferrer">
                <span>{s.label} — {s.note}</span>
                <span aria-hidden="true">↗</span>
              </a>
            </li>
          ))}
          {STREAMING_LINKS.map((s) => (
            <li key={s.label}>
              <a href={s.url} target="_blank" rel="noreferrer">
                <span>{s.label} — {s.note}</span>
                <span aria-hidden="true">↗</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-label={t('epk.contact')}>
        <div className="hero-card" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <h2 className="section-title">{t('epk.contact')}</h2>
          <p style={{ margin: 0 }}>
            Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button type="button" className="btn btn-primary" onClick={downloadPressKit}>
              <Icon name="download" size={18} /> {t('epk.download')}
            </button>
            <a className="btn btn-ghost" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </div>
          {downloaded && <p role="status" style={{ margin: 0, color: 'var(--muted)', fontSize: '0.875rem' }}>{t('share.downloaded')}</p>}
        </div>
      </section>
    </div>
  )
}
