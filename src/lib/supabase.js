/**
 * Nandha Music — Supabase client.
 *
 * Created from env config only (see src/lib/config.js). When the
 * Supabase URL/key are absent `supabase` is null and callers must fall
 * back to the local catalog — never crash on it. A missing backend is
 * a misconfiguration: auth fails closed (see src/lib/auth.jsx).
 */
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

/** True only when a real Supabase URL + anon key are present. */
export const isSupabaseConfigured =
  config.supabaseUrl !== '' && config.supabaseAnonKey !== '';

/** Supabase client, or null when unconfigured. */
export const supabase = isSupabaseConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

