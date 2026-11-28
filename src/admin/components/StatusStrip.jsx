// Admin redesign — shared components: persistent status strip.
//
// Self-contained: subscribes to the admin-role warning, reads the
// catalog source, and runs the storage probe once on mount. Red
// (admin-status-strip--bad) whenever anything is wrong. When the
// admin role is missing, a "How to fix" button opens a panel with
// the exact SQL for the Supabase SQL editor, with the signed-in
// user's UID already filled in.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { getAdminRoleWarning, onAdminRoleWarning } from '../../lib/supabaseAdmin.js'
import { getCatalogSource } from '../../lib/supabaseCatalog.js'
import { useAuth } from '../../lib/auth.jsx'
import { useI18n } from '../../lib/i18n.js'
import { getHealthSnapshot, checkStorageHealth } from '../lib/adminHealth.js'
import './status-strip.css'

export default function StatusStrip() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [roleWarning, setRoleWarning] = useState(() => getAdminRoleWarning())
  const [catalogSource, setCatalogSource] = useState(() => getCatalogSource())
  const [storage, setStorage] = useState('unknown')
  const [fixOpen, setFixOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef(null)

  useEffect(() => onAdminRoleWarning(setRoleWarning), [])

  // One storage probe on mount; the catalog source is re-read when
  // the probe settles (the page's queries have usually settled by
  // then) so the strip does not stay stuck on the boot-time value.
  useEffect(() => {
    let cancelled = false
    checkStorageHealth(supabase).then((status) => {
      if (cancelled) return
      setStorage(status)
      setCatalogSource(getCatalogSource())
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
    },
    [],
  )

  const snapshot = getHealthSnapshot({ catalogSource, roleWarning, storage })
  const isBad =
    snapshot.dataSource.status === 'fallback' ||
    snapshot.role.status === 'missing' ||
    snapshot.storage.status === 'fail'

  const uid = user?.id || '<your-user-id>'
  const sql =
    `insert into public.user_roles (user_id, role) values ('${uid}', 'admin') ` +
    `on conflict (user_id) do update set role = 'admin';`

  const copySql = async () => {
    let done = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sql)
        done = true
      }
    } catch {
      done = false
    }
    if (!done) {
      // Clipboard API unavailable (or denied) — legacy fallback.
      try {
        const textarea = document.createElement('textarea')
        textarea.value = sql
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        done = document.execCommand('copy')
        document.body.removeChild(textarea)
      } catch {
        done = false
      }
    }
    if (done) {
      setCopied(true)
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    }
  }

  const storageLabelKey =
    snapshot.storage.status === 'ok'
      ? 'admin.statusStorageOk'
      : snapshot.storage.status === 'fail'
        ? 'admin.statusStorageFail'
        : 'admin.statusStorageUnknown'

  return (
    <section
      className={`admin-status-strip${isBad ? ' admin-status-strip--bad' : ''}`}
      aria-label={t('admin.statusDataSource')}
    >
      <ul className="admin-status-strip__items">
        <li className="admin-status-strip__item">
          <span className="admin-status-strip__label">{t('admin.statusDataSource')}</span>
          <span
            className={`admin-status-strip__value admin-status-strip__value--${snapshot.dataSource.status}`}
          >
            {t(snapshot.dataSource.labelKey)}
          </span>
        </li>
        <li className="admin-status-strip__item">
          <span
            className={`admin-status-strip__value admin-status-strip__value--${snapshot.role.status}`}
          >
            {snapshot.role.status === 'missing'
              ? t('admin.statusRoleMissing')
              : t('admin.statusRoleOk')}
          </span>
        </li>
        <li className="admin-status-strip__item">
          <span
            className={`admin-status-strip__value admin-status-strip__value--${snapshot.storage.status}`}
          >
            {t(storageLabelKey)}
          </span>
        </li>
      </ul>
      {snapshot.role.status === 'missing' && (
        <div className="admin-status-strip__fix">
          <button
            type="button"
            className="admin-status-strip__fix-button"
            aria-expanded={fixOpen}
            aria-controls="admin-status-fix-panel"
            onClick={() => setFixOpen((value) => !value)}
          >
            {t('admin.statusHowToFix')}
          </button>
          {fixOpen && (
            <div id="admin-status-fix-panel" className="admin-status-strip__fix-panel">
              <pre className="admin-status-strip__sql">
                <code>{sql}</code>
              </pre>
              <button
                type="button"
                className="admin-status-strip__copy"
                onClick={copySql}
              >
                {copied ? t('admin.statusCopied') : t('admin.statusCopySql')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
