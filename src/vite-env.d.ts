/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Read from .env.local, never hardcode. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon/public key. Read from .env.local, never hardcode. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Base URL of an AI proxy (e.g. a Cloudflare Worker holding the Gemini key
   *  server-side). Preferred for production: the browser then sends no key. */
  readonly VITE_AI_PROXY_URL?: string;
  /** Gemini API key for DIRECT browser calls. Local/private testing ONLY:
   *  this value ships in the client bundle and is publicly visible. */
  readonly VITE_GEMINI_API_KEY?: string;
  /** Base URL of the TTS proxy (a Cloudflare Worker holding the Google Cloud
   *  credential server-side). When unset, cloud audio generation is disabled and
   *  the app shows a clear pt-BR message instead. Baked in at build time. */
  readonly VITE_TTS_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
