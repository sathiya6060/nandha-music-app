// Users admin — local user table with role changes and block/unblock.
// Admin-only: artists see the table read-only (role controls are disabled).
import { useMemo, useState } from 'react'
import { loadUsers, saveUsers, logActivity } from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'

const ROLES = ['admin', 'artist', 'listener']

function roleLabelKey(role) {
  if (role === 'admin') return 'auth.roleAdmin'
  if (role === 'artist') return 'auth.roleArtist'
  return 'auth.roleListener'
}

export default function UsersAdmin() {
  const { user, isAdmin } = useAuth()
  const { t, lang } = useI18n()
  const [version, setVersion] = useState(0)
  const [notice, setNotice] = useState('')

  const users = useMemo(() => loadUsers(), [version])

  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return iso || '—'
    }
  }

  const updateUser = (id, patch, actionLabel) => {
    const next = users.map((u) => (u.id === id ? { ...u, ...patch } : u))
    saveUsers(next)
    const target = users.find((u) => u.id === id)
    logActivity({ actor: user?.email || 'Admin', action: actionLabel, detail: target?.email || id })
    setNotice(t('admin.userUpdated', { email: target?.email || id }))
    setVersion((v) => v + 1)
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="admin-title">{t('admin.users')}</h1>
          <p className="admin-subtitle">
            {users.length} {t('admin.users')} · {t('admin.usersNote')}
          </p>
        </div>
      </div>

      {notice && <div className="admin-notice" role="status" aria-live="polite">{notice}</div>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">{t('admin.userName')}</th>
              <th scope="col">{t('auth.email')}</th>
              <th scope="col">{t('auth.role')}</th>
              <th scope="col">{t('admin.joined')}</th>
              <th scope="col">{t('admin.plays')}</th>
              <th scope="col">{t('admin.status')}</th>
              <th scope="col">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><span className="admin-cell-main">{u.name || '—'}</span></td>
                <td>{u.email}</td>
                <td>
                  <select
                    className="admin-input admin-input-inline"
                    value={u.role}
                    disabled={!isAdmin}
                    onChange={(e) => updateUser(u.id, { role: e.target.value }, `Changed role to ${e.target.value}`)}
                    aria-label={`${t('auth.role')} — ${u.email}`}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{t(roleLabelKey(r))}</option>
                    ))}
                  </select>
                </td>
                <td>{formatDate(u.joinedAt)}</td>
                <td>{Number(u.plays || 0).toLocaleString(lang)}</td>
                <td>
                  <span className={`admin-badge ${u.blocked ? 'admin-badge-blocked' : 'admin-badge-published'}`}>
                    {u.blocked ? t('admin.userBlocked') : t('admin.userActive')}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="admin-btn admin-btn-small"
                    disabled={!isAdmin}
                    onClick={() => updateUser(u.id, { blocked: !u.blocked }, u.blocked ? 'Unblocked user' : 'Blocked user')}
                  >
                    {u.blocked ? t('admin.unblock') : t('admin.block')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
