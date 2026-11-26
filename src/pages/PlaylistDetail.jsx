import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { playlists, tracks } from '../data/catalog.js'
import { getUserPlaylists, USER_PLAYLISTS_KEY } from './Library.jsx'
import TrackRow from '../components/TrackRow.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Icon from '../components/Icons.jsx'
import { usePlayer } from '../player/PlayerContext.jsx'

function findPlaylist(id) {
  const curated = playlists.find((p) => String(p.id) === String(id))
  if (curated) return { ...curated, isUser: false }
  const user = getUserPlaylists().find((p) => String(p.id) === String(id))
  return user ? { ...user, isUser: true } : null
}

function playlistTrackIds(p) {
  if (Array.isArray(p.trackIds)) return p.trackIds
  if (Array.isArray(p.tracks)) return p.tracks.map((tr) => (typeof tr === 'string' ? tr : tr.id))
  return []
}

function tracksInOrder(orderedIds, orderOverride) {
  const ids = orderOverride || orderedIds
  const byId = new Map(tracks.map((tr) => [String(tr.id), tr]))
  return ids.map((id) => byId.get(String(id))).filter(Boolean)
}

/**
 * Route '/playlist/:id' — header (cover collage placeholder), track list
 * with up/down reorder buttons (persisted for user playlists), play-all,
 * share button (copies the page URL).
 */
export default function PlaylistDetail() {
  const { t } = useI18n()
  const { id } = useParams()
  const player = usePlayer()
  const [playlist, setPlaylist] = useState(() => findPlaylist(id))
  const [order, setOrder] = useState(null) // user reordering (array of ids)
  const [shareMsg, setShareMsg] = useState('')

  useEffect(() => {
    setPlaylist(findPlaylist(id))
    setOrder(null)
  }, [id])

  const orderedIds = useMemo(
    () => (playlist ? playlistTrackIds(playlist) : []),
    [playlist],
  )
  const orderedTracks = useMemo(
    () => tracksInOrder(orderedIds, order),
    [orderedIds, order],
  )

  if (!playlist) {
    return (
      <div>
        <div className="page-head">
          <h1 className="page-head__title">{t('common.noResults')}</h1>
        </div>
        <EmptyState
          title={t('common.noResults')}
          message={t('common.tryDifferent')}
          action={<Link className="btn btn-primary" to="/playlists">{t('playlists.title')}</Link>}
        />
      </div>
    )
  }

  function move(index, dir) {
    const ids = order || orderedIds
    const next = [...ids]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    setOrder(next)
    if (playlist.isUser) {
      const all = getUserPlaylists().map((p) => (String(p.id) === String(id) ? { ...p, trackIds: next } : p))
      try { localStorage.setItem(USER_PLAYLISTS_KEY, JSON.stringify(all)) } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('nandha-playlists-changed'))
    }
  }

  function playAll() {
    if (orderedTracks.length > 0) player?.play?.(orderedTracks[0], orderedTracks)
  }

  async function share() {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      setShareMsg(t('common.copied'))
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = url
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setShareMsg(t('common.copied'))
      } catch {
        setShareMsg(url)
      }
    }
  }

  const firstCovers = orderedTracks.slice(0, 4).map((tr) => tr.cover).filter(Boolean)

  return (
    <div>
      <div className="detail-head">
        {playlist.cover ? (
          <img className="detail-head__cover" src={playlist.cover} alt="" />
        ) : firstCovers.length > 0 ? (
          <span
            className="cover-placeholder cover-placeholder--lg detail-head__cover"
            aria-hidden="true"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden', padding: 0 }}
          >
            {firstCovers.map((c, i) => (
              <img key={i} src={c} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ))}
            {firstCovers.length < 4 && <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>N</span>}
          </span>
        ) : (
          <span className="cover-placeholder cover-placeholder--lg detail-head__cover" aria-hidden="true" style={{ fontSize: '4rem' }}>N</span>
        )}
        <div style={{ minWidth: 0 }}>
          <p className="badge" style={{ marginBottom: 8 }}>{t('playlists.title')}</p>
          <h1 className="detail-head__title">{playlist.title}</h1>
          <p className="detail-head__meta">{playlist.description || ''}</p>
          <p className="detail-head__meta">{t('playlists.tracks', { n: orderedTracks.length })}</p>
          <div className="detail-head__actions">
            <button type="button" className="btn btn-primary" onClick={playAll} disabled={orderedTracks.length === 0}>
              {t('common.playAll')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={share}>
              <Icon name="share" size={18} /> {t('common.share')}
            </button>
          </div>
          {shareMsg && <p role="status" style={{ color: 'var(--muted)', fontSize: '0.875rem', margin: '8px 0 0', wordBreak: 'break-all' }}>{shareMsg}</p>}
        </div>
      </div>

      {orderedTracks.length === 0 ? (
        <EmptyState
          title={t('playlists.empty')}
          message={t('library.emptyHint')}
          action={<Link className="btn btn-primary" to="/search">{t('search.browse')}</Link>}
        />
      ) : (
        <div className="list-stack">
          {orderedTracks.map((track, i) => (
            <div key={track.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TrackRow track={track} index={i} queue={orderedTracks} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }} aria-label={`${track.titleTa || track.titleEn}`}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${t('common.moveUp')}: ${track.titleTa || track.titleEn}`} style={{ minHeight: 44, minWidth: 44, padding: '2px 10px' }}>
                  <Icon name="chevronUp" size={18} />
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === orderedTracks.length - 1} aria-label={`${t('common.moveDown')}: ${track.titleTa || track.titleEn}`} style={{ minHeight: 44, minWidth: 44, padding: '2px 10px' }}>
                  <Icon name="chevronDown" size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
