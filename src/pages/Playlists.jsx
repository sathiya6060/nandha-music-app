import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n, localizedTitle } from '../lib/i18n.js'
import { playlists as fallbackPlaylists } from '../data/catalog.js'
import { usePlaylists } from '../lib/supabaseCatalog.js'
import { getUserPlaylists, USER_PLAYLISTS_KEY } from './Library.jsx'
import { useToast } from '../lib/toast.jsx'
import { syncPlaylists } from '../lib/userLibrary.js'
import EmptyState from '../components/EmptyState.jsx'

function saveUserPlaylists(list) {
  try {
    localStorage.setItem(USER_PLAYLISTS_KEY, JSON.stringify(list))
  } catch {
    // storage unavailable
  }
  window.dispatchEvent(new CustomEvent('nandha-playlists-changed'))
}

/**
 * Route '/playlists' — curated playlists from the catalog plus
 * user-created playlists (localStorage, demo mode). Inline form for
 * creating a playlist (no window.prompt).
 */
export default function Playlists() {
  const { t, tp, lang } = useI18n()
  const showToast = useToast()
  // Supabase read layer (B1); static catalog is the fallback.
  const { data: sbPlaylists } = usePlaylists()
  const playlists = sbPlaylists || fallbackPlaylists
  const [userPlaylists, setUserPlaylists] = useState(() => getUserPlaylists())
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    function sync() { setUserPlaylists(getUserPlaylists()) }
    window.addEventListener('nandha-playlists-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('nandha-playlists-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  function createPlaylist(e) {
    e.preventDefault()
    const title = name.trim()
    if (!title) { setError(t('playlists.nameRequired')); return }
    if (title.length > 80) { setError(t('playlists.nameTooLong')); return }
    const next = [
      ...userPlaylists,
      { id: `user-${Date.now()}`, title, description: '', cover: null, trackIds: [], isUser: true, createdAt: new Date().toISOString() },
    ]
    saveUserPlaylists(next)
    setUserPlaylists(next)
    setName('')
    setError('')
    setShowForm(false)
    // Item 9: toast on create; the write-through syncs the new
    // playlist to Supabase for signed-in users. (There is no
    // add-to-playlist UI in the app yet, so "playlist add" toasts
    // cover creation here.)
    showToast?.(t('toast.playlistCreated'))
    syncPlaylists().catch(() => {})
  }

  function playlistCard(p) {
    const count = (p.trackIds || p.tracks || []).length
    return (
      <article className="track-card" key={p.id}>
        <Link to={`/playlist/${p.id}`} className="card-link">
          {p.cover ? (
            <img className="track-card__cover" src={p.cover} alt="" loading="lazy" />
          ) : (
            <span className="cover-placeholder track-card__cover" aria-hidden="true" style={{ fontSize: '3rem', aspectRatio: '1', width: '100%', height: 'auto' }}>N</span>
          )}
          <h3 className="track-card__title">{localizedTitle(p, lang)}</h3>
          <p className="track-card__artist">{tp('playlists.tracks', count)}</p>
        </Link>
      </article>
    )
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-head__title">{t('playlists.title')}</h1>
      </div>

      <div style={{ marginBottom: 8 }}>
        {!showForm ? (
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
            {t('playlists.create')}
          </button>
        ) : (
          <form className="inline-form" onSubmit={createPlaylist}>
            <label className="sr-only" htmlFor="new-playlist-name">{t('playlists.namePlaceholder')}</label>
            <input
              id="new-playlist-name"
              className="input"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
              placeholder={t('playlists.namePlaceholder')}
              maxLength={80}
              autoFocus
            />
            <button type="submit" className="btn btn-primary">{t('common.save')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setShowForm(false); setName(''); setError('') }}>{t('common.cancel')}</button>
            {error && <p role="alert" className="form-error">{error}</p>}
          </form>
        )}
      </div>

      {userPlaylists.length > 0 && (
        <section className="section" aria-label={t('playlists.yours')}>
          <div className="section-head">
            <div><h2 className="section-title">{t('playlists.yours')}</h2></div>
          </div>
          <div className="grid-cards">{userPlaylists.map(playlistCard)}</div>
        </section>
      )}

      <section className="section" aria-label={t('playlists.curated')}>
        <div className="section-head">
          <div><h2 className="section-title">{t('playlists.curated')}</h2></div>
        </div>
        {playlists.length === 0 ? (
          <EmptyState title={t('playlists.empty')} message={t('library.emptyHint')} />
        ) : (
          <div className="grid-cards">{playlists.map(playlistCard)}</div>
        )}
      </section>
    </div>
  )
}
