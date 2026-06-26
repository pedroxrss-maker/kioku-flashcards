import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { App } from './app/App';
import { applyRoundedFavicon } from './lib/favicon';
import { registerPwaUpdates } from './features/pwa/registerPwa';
import { cleanupDrafts } from './lib/drafts';
import { initSyncEngine } from './db/syncEngine';

applyRoundedFavicon();
registerPwaUpdates();
void cleanupDrafts(); // sweep expired form drafts (>7 days) on startup
initSyncEngine(); // offline-first: replay any queued writes when connectivity returns

// Capture the PWA install prompt BEFORE React mounts: Chrome can fire
// `beforeinstallprompt` before <InstallPrompt> renders, and the event is only
// usable once. We stash it on window and notify any mounted component via a
// custom event, so the install banner works regardless of timing.
(window as unknown as { __kiokuInstallPrompt: Event | null }).__kiokuInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as unknown as { __kiokuInstallPrompt: Event | null }).__kiokuInstallPrompt = e;
  window.dispatchEvent(new Event('kioku-install-available'));
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
