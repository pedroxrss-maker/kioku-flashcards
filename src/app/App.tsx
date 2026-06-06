import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { seedForUserIfEmpty } from '../db';
import { Toaster } from '../components/Toaster';
import { AppLayout } from './AppLayout';
import { Home } from '../pages/Home';
import { Decks } from '../pages/Decks';
import { DeckDetail } from '../pages/DeckDetail';
import { ReviewHub } from '../pages/ReviewHub';
import { ReviewSession } from '../pages/ReviewSession';
import { Stats } from '../pages/Stats';
import { Settings } from '../pages/Settings';
import { Landing } from '../pages/landing/Landing';
import { isSupabaseConfigured } from '../lib/supabase';
import { AuthProvider, useAuth } from '../features/auth/AuthContext';
import { AuthLoading, AuthPage, SupabaseConfigNotice } from '../features/auth/AuthPage';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <RootGate />
      </BrowserRouter>
    </AuthProvider>
  );
}

/** Decide what the app renders based on auth state (no flash of app/login). */
function RootGate() {
  const { user, loading } = useAuth();

  if (!isSupabaseConfigured) return <SupabaseConfigNotice />;
  if (loading) return <AuthLoading />;
  return user ? <AuthedApp /> : <PublicApp />;
}

/** Logged-out surface: public landing at "/", auth at "/entrar", everything
 *  else (gated routes) bounces to "/entrar". */
function PublicApp() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/entrar" element={<AuthPage />} />
      <Route path="*" element={<Navigate to="/entrar" replace />} />
    </Routes>
  );
}

/** The existing app, mounted only for a signed-in user. */
function AuthedApp() {
  useEffect(() => {
    // Seed sample decks into THIS user's Supabase account on first run.
    seedForUserIfEmpty().catch((err) => console.error('seed failed', err));
  }, []);

  return (
    <>
      <Routes>
        {/* Full-screen review session (no sidebar). */}
        <Route path="/review/:deckId" element={<ReviewSession />} />

        {/* A logged-in user has no use for the auth page. */}
        <Route path="/entrar" element={<Navigate to="/" replace />} />

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
      <Toaster />
    </>
  );
}
