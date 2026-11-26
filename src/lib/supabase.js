/**
 * Nandha Music — Supabase client.
 *
 * Created from env config only (see src/lib/config.js). In demo mode
 * (no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) `supabase` is null and
 * callers must fall back to the local catalog — never crash on it.
 */
import { createClient } from '@supabase/supabase-js';
import { config, isDemoMode } from './config.js';

export const isSupabaseConfigured = !isDemoMode;

/** Supabase client, or null in demo mode. */
export const supabase = isSupabaseConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export default supabase;
