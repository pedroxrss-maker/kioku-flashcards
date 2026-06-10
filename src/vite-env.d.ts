/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Read from .env.local, never hardcode. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon/public key. Read from .env.local, never hardcode. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Base URL of an AI proxy (e.g. a Cloudflare Worker holding the Anthropic key
   *  server-side). Preferred for production: the browser then sends no key. */
  readonly VITE_AI_PROXY_URL?: string;
  /** Anthropic API key for DIRECT browser calls. Local/private testing ONLY:
   *  this value ships in the client bundle and is publicly visible. */
  readonly VITE_ANTHROPIC_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
