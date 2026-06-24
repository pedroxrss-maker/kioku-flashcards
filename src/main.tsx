import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { App } from './app/App';
import { applyRoundedFavicon } from './lib/favicon';
import { registerPwaUpdates } from './features/pwa/registerPwa';
import { cleanupDrafts } from './lib/drafts';

applyRoundedFavicon();
registerPwaUpdates();
void cleanupDrafts(); // sweep expired form drafts (>7 days) on startup

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
