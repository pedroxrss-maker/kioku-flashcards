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
      registerType: 'autoUpdate',
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
        // App shell only — keep the precache lean (exclude marketing images).
        globPatterns: ['**/*.{js,css,html}'],
        globIgnores: ['**/card*.png', '**/flashcard*.png', '**/mitochondria*.png'],
        // Offline-capable shell: SPA navigations fall back to the cached
        // index.html. Never let the SW intercept Supabase requests.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /supabase/i],
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
