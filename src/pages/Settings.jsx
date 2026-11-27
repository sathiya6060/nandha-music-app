import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n.js'
import { usePlayer } from '../player/PlayerContext.jsx'
import { useTracks } from '../lib/supabaseCatalog.js'
import { useToast } from '../lib/toast.jsx'
import { setPageMeta, resetPageMeta } from '../lib/pageMeta.js'
import { DEFAULT_ALARM_TIME, loadAlarm, saveAlarm } from '../lib/streak.js'
import { SLEEP_OPTIONS_MINUTES, loadSleepDefault, saveSleepDefault } from '../lib/sleepTimer.js'
import { clearLocalData, exportLocalData } from '../lib/localData.js'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import versionInfo from '../version.json'

// Item 7 (27 Nov 2026): the ONE settings surface — /settings is a
// separate route (deep-linkable, matches /profile), /profile holds
// only account actions and links here. No duplicate settings screens.
// Guests can use everything here: playback, language, notifications
// and privacy are all local to this device. There is no "coming
// later" text anywhere on this page — every control works now.
export default function Settings() {
  const { t } = useI18n()
  const player = usePlayer()
  const showToast = useToast()
  const { tracks } = useTracks()

  const [alarm, setAlarm] = useState(() => loadAlarm())
  const [alarmTime, setAlarmTime] = useState(alarm.time || DEFAULT_ALARM_TIME)
  const [alarmTrackId, setAlarmTrackId] = useState(alarm.trackId || '')
  const [notifState, setNotifState] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  )
  const [sleepDefault, setSleepDefault] = useState(() => loadSleepDefault())
  const [confirmClear, setConfirmClear] = useState(false)
  const [alarmMsg, setAlarmMsg] = useState('')

  useEffect(() => {
    setPageMeta({ title: t('nav.settings') })
    return resetPageMeta
  }, [t])

  // The alarm time/song can also change on Home (no — Home only reads
  // it now) or in another tab; keep this form in sync.
  useEffect(() => {
    const onChange = () => {
      const next = loadAlarm()
      setAlarm(next)
      setAlarmTime(next.time || DEFAULT_ALARM_TIME)
      setAlarmTrackId(next.trackId || '')
    }
    window.addEventListener('nandha-alarm-changed', onChange)
    return () => window.removeEventListener('nandha-alarm-changed', onChange)
  }, [])

  const devotionalTracks = (tracks || [])
    .filter((tr) => tr.genre === 'Devotional' && tr.status === 'published')
    .slice(0, 12)

  function saveAartiAlarm(e) {
    e.preventDefault()
    const next = { time: alarmTime, trackId: alarmTrackId || null }
    saveAlarm(next)
    setAlarm(next)
    setAlarmMsg(t('streak.alarmSaved'))
    showToast?.(t('streak.alarmSaved'))
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') return
    const result = await Notification.requestPermission()
    setNotifState(result)
  }

  function onSleepDefaultChange(e) {
    const raw = e.target.value
    const next = raw === 'end' ? 'end' : raw === 'off' ? 'off' : Number(raw)
    saveSleepDefault(next)
    setSleepDefault(next)
  }

  return (
    <div className="settings-page">
      <div className="page-head">
        <h1 className="page-head__title">{t('settings.title')}</h1>
        <p className="page-head__sub">{t('settings.profileLink')}</p>
      </div>

      <section className="settings-section" aria-label={t('settings.playback')}>
        <h2>{t('settings.playback')}</h2>
        <div className="settings-row">
          <div className="settings-row__label">
            <span>{t('settings.quality')}</span>
          </div>
          <div className="settings-seg" role="group" aria-label={t('settings.quality')}>
            <button
              type="button"
              className={player?.quality === '128' ? 'is-active' : ''}
              onClick={() => player?.setQuality?.('128')}
              aria-pressed={player?.quality === '128'}
            >
              {t('settings.quality128')}
            </button>
            <button
              type="button"
              className={player?.quality === '320' ? 'is-active' : ''}
              onClick={() => player?.setQuality?.('320')}
              aria-pressed={player?.quality === '320'}
            >
              {t('settings.quality320')}
            </button>
          </div>
        </div>
        <div className="settings-row">
          <label className="settings-check">
            <input
              type="checkbox"
              checked={Boolean(player?.radioOn)}
              onChange={() => player?.toggleRadio?.()}
            />
            <span>{t('settings.autoplay')}</span>
          </label>
        </div>
        <div className="settings-row">
          <div className="settings-row__label">
            <label htmlFor="sleep-default">{t('settings.sleepDefault')}</label>
          </div>
          <select
            id="sleep-default"
            className="input settings-select"
            value={String(sleepDefault)}
            onChange={onSleepDefaultChange}
          >
            <option value="off">{t('settings.sleepOff')}</option>
            {SLEEP_OPTIONS_MINUTES.map((min) => (
              <option key={min} value={String(min)}>{min} min</option>
            ))}
            <option value="end">{t('settings.sleepEndOfTrack')}</option>
          </select>
        </div>
      </section>

      <section className="settings-section" aria-label={t('settings.language')}>
        <h2>{t('settings.language')}</h2>
        <div className="settings-row">
          <div className="settings-row__label">
            <span>{t('settings.languageHint')}</span>
          </div>
          <LanguageSwitcher />
        </div>
      </section>

      <section className="settings-section" aria-label={t('settings.notifications')}>
        <h2>{t('streak.aartiAlarm')}</h2>
        <p className="settings-hint" style={{ marginTop: 0 }}>{t('streak.alarmNote')}</p>
        <form onSubmit={saveAartiAlarm}>
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
            {notifState === 'default' && (
              <button type="button" className="btn btn-ghost" onClick={enableNotifications}>
                {t('streak.enableNotifications')}
              </button>
            )}
          </div>
        </form>
        {alarmMsg && <p role="status" className="settings-hint">{alarmMsg}</p>}
      </section>

      <section className="settings-section" aria-label={t('settings.privacy')}>
        <h2>{t('settings.privacy')}</h2>
        <div className="settings-row">
          <div className="settings-row__label">
            <p className="settings-row__hint">{t('settings.exportHint')}</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={exportLocalData}>
            {t('settings.exportData')}
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row__label">
            <p className="settings-row__hint">{t('settings.clearDataHint')}</p>
            {confirmClear && <p className="settings-row__hint" role="alert">{t('settings.clearConfirm')}</p>}
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              if (!confirmClear) { setConfirmClear(true); return }
              clearLocalData()
              // Reload so every screen re-reads defaults (and the
              // consent banner reappears — the choice was cleared too).
              window.location.reload()
            }}
          >
            {confirmClear ? t('settings.clearConfirm') : t('settings.clearData')}
          </button>
        </div>
      </section>

      <section className="settings-section" aria-label={t('settings.about')}>
        <h2>{t('settings.about')}</h2>
        <div className="settings-row">
          <div className="settings-row__label">
            <span>{t('settings.version')}</span>
          </div>
          <span className="settings-version">{versionInfo?.buildId || '—'}</span>
        </div>
        <div className="settings-row">
          <div className="settings-row__label">
            <span>{t('settings.legal')}</span>
          </div>
          <div className="settings-links">
            <Link to="/privacy">{t('legal.privacy')}</Link>
            <Link to="/terms">{t('legal.terms')}</Link>
            <Link to="/cookies">{t('legal.cookies')}</Link>
            <Link to="/refund">{t('legal.refund')}</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
