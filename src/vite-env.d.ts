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
  /** Base URL of the image proxy (a Cloudflare Worker holding the OpenAI key
   *  server-side). When unset, AI image generation is disabled and the controls
   *  are hidden. Baked in at build time. */
  readonly VITE_IMAGE_PROXY_URL?: string;
  /** Base URL of the delete-account Worker (holds the service key; deletes the
   *  caller's own account via the Supabase Auth Admin API). When unset, account
   *  deletion is unavailable and the flow throws a clear pt-BR message. */
  readonly VITE_DELETE_ACCOUNT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
