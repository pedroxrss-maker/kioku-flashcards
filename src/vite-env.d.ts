/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Read from .env.local — never hardcode. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon/public key. Read from .env.local — never hardcode. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
