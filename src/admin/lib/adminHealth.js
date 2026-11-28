// Admin redesign — shared components: health snapshot + storage probe.
//
// Pure helpers for the admin StatusStrip (src/admin/components/
// StatusStrip.jsx). No React, no Supabase calls inside
// getHealthSnapshot — it only folds already-known signals into one
// snapshot the strip can render. checkStorageHealth does the one
// live probe (a 1-object list from the public 'covers' bucket).

/**
 * Fold the three admin health signals into one snapshot.
 *
 * @param {object} input
 * @param {'supabase'|'fallback'|string} [input.catalogSource] — from
 *   getCatalogSource() in src/lib/supabaseCatalog.js.
 * @param {boolean} [input.roleWarning] — from getAdminRoleWarning()
 *   in src/lib/supabaseAdmin.js (true = the user_roles row is missing).
 * @param {'ok'|'fail'|'unknown'} [input.storage] — from
 *   checkStorageHealth() below.
 * @returns {{ dataSource: {status: 'live'|'fallback', labelKey: string},
 *   role: {status: 'ok'|'missing'|'unknown'},
 *   storage: {status: 'ok'|'fail'|'unknown'} }}
 */
export function getHealthSnapshot({ catalogSource, roleWarning, storage } = {}) {
  const dataSource =
    catalogSource === 'supabase'
      ? { status: 'live', labelKey: 'admin.statusDataLive' }
      : { status: 'fallback', labelKey: 'admin.statusDataFallback' }
  const role =
    roleWarning === true
      ? { status: 'missing' }
      : roleWarning === false
        ? { status: 'ok' }
        : { status: 'unknown' }
  const storageStatus =
    storage === 'ok' || storage === 'fail' || storage === 'unknown' ? storage : 'unknown'
  return { dataSource, role, storage: { status: storageStatus } }
}

export const STORAGE_PROBE_TIMEOUT_MS = 5000

/**
 * Probe Supabase Storage health: list 1 object from the public
 * 'covers' bucket. Resolves 'ok' when the list succeeds, 'fail'
 * when Storage answers with an error, and 'unknown' when there is
 * no client to probe or the probe does not answer within timeoutMs.
 * Never hangs: the timeout always wins the race.
 */
export async function checkStorageHealth(client, { timeoutMs = STORAGE_PROBE_TIMEOUT_MS } = {}) {
  if (!client || typeof client.storage?.from !== 'function') return 'unknown'
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : STORAGE_PROBE_TIMEOUT_MS
  let timer = null
  try {
    const probe = client.storage.from('covers').list('', { limit: 1 })
    const timedOut = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ __adminHealthTimeout: true }), timeout)
    })
    const result = await Promise.race([Promise.resolve(probe), timedOut])
    if (result && result.__adminHealthTimeout) return 'unknown'
    if (result && result.error) return 'fail'
    return 'ok'
  } catch {
    return 'fail'
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}
