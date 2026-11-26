import { useEffect, useMemo, useRef, useState } from 'react'
import { usePlayer } from './PlayerContext.jsx'
import { useI18n } from '../lib/i18n.js'
import './player.css'

/**
 * LyricsPanel — synced or plain lyrics for a track.
 * Props: { track, className?: string }
 * track.lyricsTa may be:
 *   - an array of { t, ta, en } (synced lines, t = seconds), or
 *   - an array of plain Tamil strings, or
 *   - a plain string (lines separated by \n)
 * track.lyricsEn is the English fallback in the same shapes.
 *
 * Plain-string lyrics (e.g. the real track's lyricsTa array of strings)
 * render as a plain list: no active line, no auto-scroll — that only
 * applies when lines carry timestamps (synced).
 */
export function normaliseLines(track) {
  const ta = track?.lyricsTa
  const en = track?.lyricsEn
  const out = { synced: false, lines: [] }

  const toLines = (value) => {
    if (!value) return []
    if (typeof value === 'string') {
      return value
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((text) => ({ t: null, ta: text, en: null }))
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'string') return { t: null, ta: item, en: null }
          if (item && typeof item === 'object') {
            return {
              t: Number.isFinite(item.t) ? item.t : null,
              ta: item.ta || item.text || item.tamil || '',
              en: item.en || item.english || null,
            }
          }
          return null
        })
        .filter((l) => l && (l.ta || l.en))
    }
    return []
  }

  const taLines = toLines(ta)
  const enLines = toLines(en)

  if (taLines.length > 0 && taLines.some((l) => l.t != null)) {
    // Synced Tamil lines; pair English by index where available.
    out.synced = true
    out.lines = taLines.map((l, i) => ({
      ...l,
      en: l.en || enLines[i]?.ta || enLines[i]?.en || null,
    }))
    return out
  }
  if (taLines.length > 0) {
    out.lines = taLines.map((l, i) => ({
      ...l,
      en: l.en || enLines[i]?.ta || null,
    }))
    return out
  }
  if (enLines.length > 0) {
    out.lines = enLines.map((l) => ({ t: l.t, ta: '', en: l.ta || l.en }))
    return out
  }
  return out
}

export default function LyricsPanel({ track, className }) {
  const { currentTime } = usePlayer()
  const { t } = useI18n()
  const [lang, setLang] = useState('ta') // 'ta' | 'en'
  const activeRef = useRef(null)
  const listRef = useRef(null)

  const { synced, lines } = useMemo(() => normaliseLines(track), [track])

  const activeIndex = useMemo(() => {
    if (!synced) return -1
    let idx = -1
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].t != null && lines[i].t <= currentTime) idx = i
      else break
    }
    return idx
  }, [synced, lines, currentTime])

  // Keep the active line visible (only scrolls the lyrics list itself).
  // Plain (unsynced) lyrics have no active line, so nothing scrolls.
  useEffect(() => {
    if (activeIndex >= 0 && activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeIndex])

  const isSample = track?.isSample || (track && !track.audio128 && !track.audio320)
  const rootClassName = `lyrics-panel${className ? ` ${className}` : ''}`

  if (!track) {
    return (
      <div className={rootClassName}>
        <p className="lyrics-empty">{t('player.lyricsSoon')}</p>
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <div className={rootClassName}>
        <div className="lyrics-head">
          <h3>{t('common.lyrics')}</h3>
        </div>
        <p className="lyrics-empty">{t('player.lyricsSoon')}</p>
        {isSample && <p className="lyrics-note">{t('player.lyricsFullSoon')}</p>}
      </div>
    )
  }

  const showEnglish = lang === 'en'

  return (
    <div className={rootClassName}>
      <div className="lyrics-head">
        <h3>{t('common.lyrics')}</h3>
        <div className="lyrics-lang-toggle" role="group" aria-label={t('common.lyrics')}>
          <button
            type="button"
            className={lang === 'ta' ? 'is-active' : ''}
            onClick={() => setLang('ta')}
            aria-pressed={lang === 'ta'}
          >
            {t('player.tamil')}
          </button>
          <button
            type="button"
            className={lang === 'en' ? 'is-active' : ''}
            onClick={() => setLang('en')}
            aria-pressed={lang === 'en'}
          >
            {t('player.english')}
          </button>
        </div>
      </div>

      <div className="lyrics-list" ref={listRef}>
        {lines.map((line, i) => {
          const text = showEnglish ? line.en || line.ta : line.ta || line.en
          const isActive = synced && i === activeIndex
          return (
            <p
              key={`${line.t ?? i}-${i}`}
              ref={isActive ? activeRef : null}
              className={`lyrics-line ${isActive ? 'is-active' : ''} ${synced && i < activeIndex ? 'is-past' : ''}`}
              lang={showEnglish ? 'en' : 'ta'}
            >
              {text}
            </p>
          )
        })}
      </div>
    </div>
  )
}
