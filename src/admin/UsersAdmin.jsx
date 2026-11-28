// Users admin — REAL user table (Area C-ADMIN, migration 007).
// Reads via the admin_list_users() SECURITY DEFINER RPC (auth.users
// left-joined to user_roles + profiles) and writes via
// admin_set_user(). Role changes and block/unblock actually persist;
// a blocked user cannot sign in (enforced in src/lib/auth.jsx).
// Nothing here touches localStorage: the old local-only table and its
// fake controls are gone. If migration 007 is not applied yet the RPC
// errors and this page says so with a retry — it never shows an empty
// table as if there were no users.
//
// Admin redesign §7: debounced search, CSV export of the shown rows,
// ConfirmDialog for block/unblock (no window.confirm), skeleton rows
// while loading, stacked cards on mobile. The RPC calls themselves
// are unchanged from the verified 007 implementation.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { logActivity } from '../lib/adminStore.js'
import { useAuth } from '../lib/auth.jsx'
import { useI18n } from '../lib/i18n.js'
import { useToast } from '../lib/toast.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import './dashboard.css'

const ROLES = ['admin', 'artist', 'listener']

function roleLabelKey(role) {
  if (role === 'admin') return 'auth.roleAdmin'
  if (role === 'artist') return 'auth.roleArtist'
  return 'auth.roleListener'
}

// The admin_list_users() RPC call itself (no setState) — shared by
// the mount effect and the retry handler, so the effect only ever
// sets state in async continuations (react set-state-in-effect).
async function fetchAdminUsers() {
  return supabase.rpc('admin_list_users')
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

export default function UsersAdmin() {
  const { user, isAdmin } = useAuth()
  const { t, lang } = useI18n()
  const showToast = useToast()
  const [users, setUsers] = useState([])
  // No client → not loading (the render shows the db error below).
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState('')
  // "Not configured" is derived during render, not set in an effect.
  const shownError = !supabase ? t('admin.dbNotConnected') : error
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  // Pending block/unblock confirm: { user, blocked } or null.
  const [pendingBlock, setPendingBlock] = useState(null)

  // Debounced search (300 ms) — the list filters only after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 300)
    return () => clearTimeout(timer)
  }, [query])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    if (!supabase) {
      setError(t('admin.dbNotConnected'))
      setLoading(false)
      return
    }
    const { data, error: rpcError } = await fetchAdminUsers()
    if (rpcError) {
      setError(`${t('admin.usersLoadFailed')} — ${rpcError.message || rpcError.code || 'RPC failed'}`)
      setUsers([])
    } else {
      setUsers(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }, [t])

  // Mount load: every setState here runs in the .then continuation,
  // never synchronously in the effect body.
  useEffect(() => {
    if (!supabase) return undefined
    let cancelled = false
    void fetchAdminUsers().then(({ data, error: rpcError }) => {
      if (cancelled) return
      if (rpcError) {
        setError(`${t('admin.usersLoadFailed')} — ${rpcError.message || rpcError.code || 'RPC failed'}`)
        setUsers([])
      } else {
        setUsers(Array.isArray(data) ? data : [])
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [t])

  const shownUsers = useMemo(() => {
    if (!debouncedQuery) return users
    return users.filter((u) =>
      `${u.display_name || ''} ${u.email || ''}`.toLowerCase().includes(debouncedQuery),
    )
  }, [users, debouncedQuery])

  const exportCsv = () => {
    const header = ['Name', 'Email', 'Role', 'Joined', 'Status']
    const lines = shownUsers.map((u) =>
      [
        csvCell(u.display_name || ''),
        csvCell(u.email || ''),
        csvCell(u.role || ''),
        csvCell(u.created_at || ''),
        csvCell(u.blocked ? 'blocked' : 'active'),
      ].join(','),
    )
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'nandha-music-users.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const updateUser = async (id, patch, actionLabel) => {
    setError('')
    if (!supabase) {
      setError(t('admin.dbNotConnected'))
      return
    }
    const target = users.find((u) => u.id === id)
    const { data, error: rpcError } = await supabase.rpc('admin_set_user', {
      p_user_id: id,
      p_role: patch.role ?? null,
      p_blocked: patch.blocked ?? null,
    })
    if (rpcError || !Array.isArray(data) || data.length === 0) {
      setError(
        rpcError
          ? `${t('admin.saveFailed')} — ${rpcError.message || rpcError.code || 'RPC failed'}`
          : t('admin.saveFailed'),
      )
      return
    }
    const updated = data[0]
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...updated } : u)))
    logActivity({ actor: user?.email || 'Admin', action: actionLabel, detail: target?.email || id })
    showToast(t('admin.userUpdated', { email: target?.email || id }))
  }

  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return iso || '—'
    }
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

      {shownError && (
        <div className="admin-notice admin-notice-warn" role="alert" aria-live="polite">
          {shownError}
          <button
            type="button"
            className="admin-btn admin-btn-small"
            onClick={() => void load()}
            style={{ marginLeft: 12 }}
          >
            {t('admin.fallbackRetry')}
          </button>
        </div>
      )}

      <div className="dash-users-toolbar">
        <label className="admin-search" htmlFor="admin-users-search">
          <span className="admin-field-label">{t('admin.searchUsers')}</span>
          <input
            id="admin-users-search"
            type="search"
            className="admin-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('admin.searchUsers')}
            disabled={loading}
          />
        </label>
        <button
          type="button"
          className="admin-btn"
          onClick={exportCsv}
          disabled={loading || shownUsers.length === 0}
        >
          {t('admin.exportCsv')}
        </button>
      </div>

      {loading ? (
        <div className="admin-table-wrap" aria-busy="true" aria-label={t('common.loading')}>
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
              {[0, 1, 2].map((i) => (
                <tr key={i} className="dash-skeleton-row">
                  <td><span className="dash-skeleton-bar" /></td>
                  <td><span className="dash-skeleton-bar" /></td>
                  <td><span className="dash-skeleton-bar" /></td>
                  <td><span className="dash-skeleton-bar" /></td>
                  <td><span className="dash-skeleton-bar" /></td>
                  <td><span className="dash-skeleton-bar" /></td>
                  <td><span className="dash-skeleton-bar" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : users.length === 0 && !shownError ? (
        <p className="admin-muted">{t('admin.noUsersFound')}</p>
      ) : shownUsers.length === 0 ? (
        <p className="admin-muted">{t('admin.noUsersMatch')}</p>
      ) : (
        <div className="admin-table-wrap dash-users-table">
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
              {shownUsers.map((u) => (
                <tr key={u.id}>
                  <td data-label={t('admin.userName')}><span className="admin-cell-main">{u.display_name || '—'}</span></td>
                  <td data-label={t('auth.email')}>{u.email}</td>
                  <td data-label={t('auth.role')}>
                    <select
                      className="admin-input admin-input-inline"
                      value={u.role}
                      disabled={!isAdmin}
                      onChange={(e) => void updateUser(u.id, { role: e.target.value }, `Changed role to ${e.target.value}`)}
                      aria-label={`${t('auth.role')} — ${u.email}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{t(roleLabelKey(r))}</option>
                      ))}
                    </select>
                  </td>
                  <td data-label={t('admin.joined')}>{formatDate(u.created_at)}</td>
                  {/* Per-user plays are not tracked (play_events rows
                      carry no user id) — never fabricate a number. */}
                  <td data-label={t('admin.plays')}>—</td>
                  <td data-label={t('admin.status')}>
                    <span className={`admin-badge ${u.blocked ? 'admin-badge-blocked' : 'admin-badge-published'}`}>
                      {u.blocked ? t('admin.userBlocked') : t('admin.userActive')}
                    </span>
                  </td>
                  <td data-label={t('common.actions')}>
                    <button
                      type="button"
                      className="admin-btn admin-btn-small"
                      disabled={!isAdmin}
                      onClick={() => setPendingBlock({ user: u, blocked: !u.blocked })}
                    >
                      {u.blocked ? t('admin.unblock') : t('admin.block')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={pendingBlock !== null}
        title={t(pendingBlock?.blocked ? 'admin.confirmBlockTitle' : 'admin.confirmUnblockTitle')}
        body={t(pendingBlock?.blocked ? 'admin.confirmBlock' : 'admin.confirmUnblock', {
          email: pendingBlock?.user?.email || '',
        })}
        confirmLabel={t(pendingBlock?.blocked ? 'admin.block' : 'admin.unblock')}
        danger={Boolean(pendingBlock?.blocked)}
        onCancel={() => setPendingBlock(null)}
        onConfirm={() => {
          const pending = pendingBlock
          setPendingBlock(null)
          if (pending) {
            void updateUser(
              pending.user.id,
              { blocked: pending.blocked },
              pending.blocked ? 'Blocked user' : 'Unblocked user',
            )
          }
        }}
      />
    </div>
  )
}
