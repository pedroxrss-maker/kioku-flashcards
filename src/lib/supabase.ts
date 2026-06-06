/**
 * Single configured Supabase client for the app.
 *
 * URL + anon key come ONLY from Vite env vars (.env.local) — never hardcoded.
 * When they are missing we fall back to a syntactically valid placeholder so the
 * bundle never throws at import time (e.g. in CI); auth simply stays unavailable
 * and the UI shows a "configure" notice via `isSupabaseConfigured`.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True only when both env vars are present. Gate the auth flow on this. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.error(
    'Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local.',
  );
}

export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'anon-key-missing',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
