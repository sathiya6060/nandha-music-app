// Area C-ADMIN fix pass (28 Nov 2026): auth.jsx pure helpers —
// roleFromSupabaseUser / resolveRole (is_admin RPC contract with the
// email-allowlist fallback), mapAuthError (distinct sign-up / sign-in
// messages), checkBlockedStatus (is_blocked RPC + profiles fallback).
// The React provider itself is exercised live, not in node — these
// units are the parts a unit test can pin down.
import { describe, it, expect, vi } from 'vitest'

import {
  roleFromSupabaseUser,
  resolveRole,
  mapAuthError,
  checkBlockedStatus,
} from '../authHelpers.js'

const ADMIN = { id: 'u1', email: 'OfficialNandhaMusic@GMAIL.com', app_metadata: {} }
const ARTIST = { id: 'u2', email: 'singer@example.com', app_metadata: { role: 'artist' } }
const LISTENER = { id: 'u3', email: 'fan@example.com', app_metadata: {} }
const META_SPOOF = {
  id: 'u4',
  email: 'fan@example.com',
  app_metadata: {},
  user_metadata: { role: 'artist' },
}

describe('roleFromSupabaseUser (allowlist fallback only)', () => {
  it('returns listener for no user', () => {
    expect(roleFromSupabaseUser(null)).toBe('listener')
    expect(roleFromSupabaseUser(undefined)).toBe('listener')
  })

  it('admin email (case-insensitive) is admin', () => {
    expect(roleFromSupabaseUser(ADMIN)).toBe('admin')
  })

  it('app_metadata artist is artist', () => {
    expect(roleFromSupabaseUser(ARTIST)).toBe('artist')
  })

  it('user_metadata must NEVER decide a role (user-writable)', () => {
    expect(roleFromSupabaseUser(META_SPOOF)).toBe('listener')
  })

  it('a plain user is a listener', () => {
    expect(roleFromSupabaseUser(LISTENER)).toBe('listener')
  })
})

describe('resolveRole (is_admin RPC is the source of truth)', () => {
  it('RPC true wins over everything — even a non-admin email', () => {
    expect(resolveRole(LISTENER, true)).toBe('admin')
  })

  it('RPC false: artist still comes from app_metadata', () => {
    expect(resolveRole(ARTIST, false)).toBe('artist')
    expect(resolveRole(LISTENER, false)).toBe('listener')
  })

  it('RPC null (pending/failed): allowlist fallback for UI routing', () => {
    expect(resolveRole(ADMIN, null)).toBe('admin')
    expect(resolveRole(ARTIST, null)).toBe('artist')
    expect(resolveRole(LISTENER, null)).toBe('listener')
  })
})

describe('mapAuthError (distinct sign-up / sign-in messages)', () => {
  it('returns null when there is no error', () => {
    expect(mapAuthError(null)).toBeNull()
    expect(mapAuthError(undefined)).toBeNull()
  })

  it('invalid credentials (sign-in)', () => {
    expect(mapAuthError({ message: 'Invalid login credentials' }, 'signin')).toBe(
      'auth.invalidCredentials',
    )
  })

  it('already registered (sign-up) never reads as a sign-in error', () => {
    expect(mapAuthError({ message: 'User already registered' }, 'signup')).toBe(
      'auth.emailAlreadyRegistered',
    )
  })

  it('weak password (sign-up)', () => {
    expect(mapAuthError({ message: 'Password should be at least 6 characters' }, 'signup')).toBe(
      'auth.weakPassword',
    )
  })

  it('email not confirmed', () => {
    expect(mapAuthError({ message: 'Email not confirmed' }, 'signin')).toBe(
      'auth.emailNotConfirmed',
    )
  })

  it('rate limiting by status and by message', () => {
    expect(mapAuthError({ message: 'too many requests', status: 429 }, 'signin')).toBe(
      'auth.rateLimited',
    )
    expect(mapAuthError({ message: 'Rate limit exceeded' }, 'signup')).toBe('auth.rateLimited')
  })

  it('generic failures keep the modes distinct', () => {
    expect(mapAuthError({ message: 'something broke' }, 'signup')).toBe('auth.signUpError')
    expect(mapAuthError({ message: 'something broke' }, 'signin')).toBe('auth.signInError')
  })

  it('internal sentinel messages map to their keys', () => {
    expect(mapAuthError({ message: 'config_error' }, 'signin')).toBe('auth.configError')
    expect(mapAuthError({ message: 'account_blocked' }, 'signin')).toBe('auth.accountBlocked')
  })
})

describe('checkBlockedStatus (migration 007)', () => {
  function fakeClient({ rpcResult, rpcError, rpcThrows, profilesBlocked, profilesError }) {
    return {
      rpc: async () => {
        if (rpcThrows) throw new Error('function is_blocked does not exist')
        if (rpcError) return { data: null, error: rpcError }
        return { data: rpcResult, error: null }
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (profilesError) return { data: null, error: profilesError }
              return { data: profilesBlocked === undefined ? null : { blocked: profilesBlocked }, error: null }
            },
          }),
        }),
      }),
    }
  }

  it('RPC true means blocked', async () => {
    await expect(checkBlockedStatus(fakeClient({ rpcResult: true }), 'u1')).resolves.toBe(true)
  })

  it('RPC false means not blocked (no fallback read)', async () => {
    const client = fakeClient({ rpcResult: false })
    const spy = vi.spyOn(client, 'from')
    await expect(checkBlockedStatus(client, 'u1')).resolves.toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  it('RPC error falls back to the profiles read', async () => {
    await expect(
      checkBlockedStatus(fakeClient({ rpcError: { message: 'nope' }, profilesBlocked: true }), 'u1'),
    ).resolves.toBe(true)
  })

  it('missing RPC (007 not applied) falls back to the profiles read', async () => {
    await expect(
      checkBlockedStatus(fakeClient({ rpcThrows: true, profilesBlocked: false }), 'u1'),
    ).resolves.toBe(false)
  })

  it('any failure means "not blocked" — a blocked flag cannot exist before 007', async () => {
    await expect(
      checkBlockedStatus(
        fakeClient({ rpcThrows: true, profilesError: { message: 'no profiles row' } }),
        'u1',
      ),
    ).resolves.toBe(false)
  })

  it('no client or no user id means not blocked', async () => {
    await expect(checkBlockedStatus(null, 'u1')).resolves.toBe(false)
    await expect(checkBlockedStatus(fakeClient({ rpcResult: true }), null)).resolves.toBe(false)
  })
})
