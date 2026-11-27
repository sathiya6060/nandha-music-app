import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n.js'
import { REAL_TRACK_ID } from '../data/catalog.js'
import { useTracks } from '../lib/supabaseCatalog.js'
import { usePlayer } from '../player/PlayerContext.jsx'
import { loadAlarm, markAartiFired, shouldFireAarti } from '../lib/streak.js'

// Item 7 (27 Nov 2026): the Aarti alarm used to live in Home's
// StreakHero, so it only fired while the user was on Home. It now
// watches from the app shell, on every route. Behaviour is unchanged:
// every 30s it checks whether the saved alarm time has been hit today
// (shouldFireAarti), fires a Notification if permission is granted,
// and plays the picked devotional song. It only fires while the app /
// tab is open — there is no background push.
export default function AartiAlarmWatcher() {
  const { t } = useI18n()
  const { tracks } = useTracks()
  const player = usePlayer()
  const [alarm, setAlarm] = useState(() => loadAlarm())
  const playerRef = useRef(player)
  // Keep the ref fresh without writing it during render (oxlint
  // react/refs): the interval below reads the ref, not the closure.
  useEffect(() => {
    playerRef.current = player
  })

  useEffect(() => {
    const onChange = () => setAlarm(loadAlarm())
    window.addEventListener('nandha-alarm-changed', onChange)
    return () => window.removeEventListener('nandha-alarm-changed', onChange)
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      if (!shouldFireAarti(alarm)) return
      markAartiFired()
      const list = tracks || []
      const song = (alarm.trackId && list.find((tr) => tr.id === alarm.trackId)) || list.find((tr) => tr.id === REAL_TRACK_ID)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && song) {
        try {
          new Notification('Nandha Music', {
            body: `${song.titleTa || song.titleEn || ''} — ${t('streak.aartiAlarm')}`,
          })
        } catch {
          // notifications blocked — playback below still runs
        }
      }
      if (song) playerRef.current?.play?.(song, [song])
    }, 30000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarm, tracks])

  return null
}
