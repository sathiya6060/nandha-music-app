import { config } from './config.js'
import { supabase } from './supabase.js'

/**
 * Delete account (item 7, 27 Nov 2026): the signed-in account is
 * deleted through the `delete-account` Supabase Edge Function — the
 * client NEVER holds the service_role key. The function verifies the
 * caller's JWT, deletes the user's rows (liked_tracks, followed_artists,
 * playlists + playlist_tracks via cascade) and then the Auth user
 * itself with its own server-side service_role secret.
 *
 * Deploy (Supabase dashboard / CLI — needs a human with dashboard
 * access; the function file lives at
 * supabase/functions/delete-account/index.ts):
 *   1. supabase functions deploy delete-account
 *   2. supabase secrets set SERVICE_ROLE_KEY=<service_role key>
 *      (Dashboard: Edge Functions → Secrets — never in client code,
 *      never in the repo.)
 * Until the function is deployed this returns { ok:false,
 * reason:'not-deployed' } and the UI shows the honest "email us"
 * message instead of faking a deletion.
 */
export const DELETE_ACCOUNT_TIMEOUT_MS = 15 * 1000

export async function deleteAccount() {
  if (!config.supabaseUrl || !supabase) return { ok: false, reason: 'not-deployed' }
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) return { ok: false, reason: 'no-session' }
  // M38: the request has a timeout (it used to hang forever), and a
  // 204 No Content / empty-body success counts as deleted — the old
  // code required the body to contain { ok: true }, so a successful
  // deletion was reported as failed.
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer =
    controller !== null
      ? setTimeout(() => controller.abort(), DELETE_ACCOUNT_TIMEOUT_MS)
      : null
  try {
    const res = await fetch(`${config.supabaseUrl}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: controller?.signal,
    })
    if (res.status === 404) return { ok: false, reason: 'not-deployed' }
    if (!res.ok) return { ok: false, reason: 'failed' }
    if (res.status === 204) return { ok: true }
    const text = await res.text().catch(() => '')
    if (!text.trim()) return { ok: true }
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      return { ok: false, reason: 'failed' }
    }
    if (body?.ok) return { ok: true }
    if (body && typeof body === 'object' && Object.keys(body).length === 0) return { ok: true }
    return { ok: false, reason: 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}
