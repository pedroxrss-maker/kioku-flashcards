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

/**
 * Proactive refresh margin (ms). getSession() already refreshes within gotrue's
 * own 90s margin, but that is too tight for LONG authenticated calls (the
 * banco-provas SSE runs for tens of seconds) and for client/server CLOCK SKEW —
 * a token the client still considers valid can be seen as expired by the server.
 * So we force a refresh when the access token is within this (wider) window of
 * expiry, before ever sending it. Kept just above gotrue's margin.
 */
const TOKEN_REFRESH_MARGIN_MS = 120_000; // 2 min

/**
 * A FRESH Supabase access token (JWT) for authenticated calls — the single helper
 * every authed request should use instead of reading getSession() directly. If the
 * current token is within TOKEN_REFRESH_MARGIN_MS of expiry it forces a refresh
 * first; on refresh failure it falls back to the still-current token (which may
 * yet be accepted) rather than dropping the user. Returns null only when there is
 * no session at all (the caller should then prompt a login).
 */
export async function getFreshAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.access_token) return null;
    const expMs = (session.expires_at ?? 0) * 1000;
    if (expMs && expMs - Date.now() < TOKEN_REFRESH_MARGIN_MS) {
      const fresh = await refreshAccessToken();
      return fresh ?? session.access_token;
    }
    return session.access_token;
  } catch {
    return null;
  }
}

/**
 * Force a Supabase session refresh and return the NEW access token (or null if the
 * refresh failed). Use this to retry ONCE after an upfront 401 from an authed
 * endpoint — never mid-operation once a server has already done metered work.
 */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
