/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA: makes Kioku installable and serves the app shell from a precache so
    // it opens fast in its own standalone window. autoUpdate => a new deploy
    // silently replaces the installed version on next load.
    //
    // We deliberately do NOT cache Supabase API/Storage calls — data lives in
    // Supabase and studying still requires the network. Only the static app
    // shell (built JS/CSS/HTML + icons) is precached.
    VitePWA({
      // 'prompt': a new deploy does NOT auto-reload. We register the SW ourselves
      // (src/features/pwa) and apply the update SILENTLY at a safe moment (route
      // change / refocus, never mid-review) via <PwaAutoUpdate> — no banner. We
      // keep 'prompt' (NOT 'autoUpdate') precisely so the SW never reloads on its
      // own; injectRegister is off so the plugin doesn't add its own script.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: [
        'favicon-32.png',
        'apple-touch-icon.png',
        'pwa-192.png',
        'pwa-512.png',
        'pwa-maskable-512.png',
      ],
      manifest: {
        name: 'Kioku',
        short_name: 'Kioku',
        description: 'Flashcards com repetição espaçada',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0e0e11',
        theme_color: '#0e0e11',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache ONLY the content-hashed JS/CSS (immutable → never stale) plus
        // the icons/manifest (via includeAssets). index.html is deliberately NOT
        // precached, so it is never served cache-first.
        globPatterns: ['**/*.{js,css}'],
        // Disable the default precache-bound navigation fallback (it would serve
        // index.html cache-first and shadow the NetworkFirst rule below). Offline
        // navigations fall back to the NetworkFirst cache instead.
        navigateFallback: null,
        runtimeCaching: [
          {
            // Page navigations (the HTML shell): NETWORK-FIRST. A returning user
            // always gets the newest index.html — and therefore the newest
            // hashed bundles — on a normal reload; the cached copy is used only
            // as an offline fallback (after a 3s network timeout).
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'kioku-html',
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 16 },
            },
          },
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      // Service worker is generated for the production build only.
      devOptions: { enabled: false },
    }),
  ],
  // sql.js is loaded from a CDN at runtime (see apkg-import.ts), so it isn't
  // bundled — only its TypeScript types are imported.
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
