import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { seedIfEmpty } from '../db';
import { AppLayout } from './AppLayout';
import { Home } from '../pages/Home';
import { Decks } from '../pages/Decks';
import { DeckDetail } from '../pages/DeckDetail';
import { ReviewHub } from '../pages/ReviewHub';
import { ReviewSession } from '../pages/ReviewSession';
import { Stats } from '../pages/Stats';
import { Settings } from '../pages/Settings';

export function App() {
  useEffect(() => {
    seedIfEmpty().catch((err) => console.error('seed failed', err));
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Full-screen review session (no sidebar). */}
        <Route path="/review/:deckId" element={<ReviewSession />} />

        {/* Everything else lives inside the app shell. */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/decks" element={<Decks />} />
          <Route path="/decks/:id" element={<DeckDetail />} />
          <Route path="/review" element={<ReviewHub />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
