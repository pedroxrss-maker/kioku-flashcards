import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { seedForUserIfEmpty } from '../db';
import { Toaster } from '../components/Toaster';
import { CelebrationBanner } from '../features/gamification/CelebrationBanner';
import { CheckoutIntentRedirect } from '../features/billing/CheckoutIntentRedirect';
import { UpgradeModalProvider } from '../features/billing/UpgradeModalProvider';
import { AppLayout } from './AppLayout';
import { Home } from '../pages/Home';
import { Decks } from '../pages/Decks';
import { GenerateDeck } from '../pages/GenerateDeck';
import { DeckDetail } from '../pages/DeckDetail';
import { ReviewHub } from '../pages/ReviewHub';
import { ReviewSession } from '../pages/ReviewSession';
import { Stats } from '../pages/Stats';
import { Awards } from '../pages/Awards';
import { Friends } from '../pages/Friends';
import { Settings } from '../pages/Settings';
import { scheduleAchievementCheck } from '../features/gamification/achievements';
import { Landing } from '../pages/landing/Landing';
import { PrivacyPolicy } from '../pages/legal/PrivacyPolicy';
import { isSupabaseConfigured } from '../lib/supabase';
import { AuthProvider, useAuth } from '../features/auth/AuthContext';
import { AuthLoading, AuthPage, ResetPasswordPage, SupabaseConfigNotice } from '../features/auth/AuthPage';
import { ThemeProvider } from '../theme/theme';

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
  const { user, loading, recovery } = useAuth();

  if (!isSupabaseConfigured) return <SupabaseConfigNotice />;
  if (loading) return <AuthLoading />;
  if (recovery) return <ResetPasswordPage />;
  return user ? <AuthedApp /> : <PublicApp />;
}

/** Logged-out surface: public landing at "/", auth at "/entrar", everything
 *  else (gated routes) bounces to "/entrar". */
function PublicApp() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/entrar" element={<AuthPage />} />
      {/* Página legal pública: acessível sem login, não redireciona para /entrar. */}
      <Route path="/privacidade" element={<PrivacyPolicy />} />
      <Route path="*" element={<Navigate to="/entrar" replace />} />
    </Routes>
  );
}

/** The existing app, mounted only for a signed-in user. */
function AuthedApp() {
  useEffect(() => {
    // Seed sample decks into THIS user's Supabase account on first run, then run
    // the achievement evaluation (after seeding, so seeded decks/cards count).
    seedForUserIfEmpty()
      .catch((err) => console.error('seed failed', err))
      .finally(() => scheduleAchievementCheck(800));
  }, []);

  return (
    <ThemeProvider>
    <UpgradeModalProvider>
      <Routes>
        {/* Full-screen review session (no sidebar). */}
        <Route path="/review/:deckId" element={<ReviewSession />} />

        {/* Página legal pública, também alcançável logado (standalone, sem shell). */}
        <Route path="/privacidade" element={<PrivacyPolicy />} />

        {/* A logged-in user has no use for the auth page. */}
        <Route path="/entrar" element={<Navigate to="/" replace />} />

        {/* Everything else lives inside the app shell. */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/decks" element={<Decks />} />
          <Route path="/generate" element={<GenerateDeck />} />
          <Route path="/decks/:id" element={<DeckDetail />} />
          <Route path="/review" element={<ReviewHub />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/conquistas" element={<Awards />} />
          <Route path="/amigos" element={<Friends />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
      <CelebrationBanner />
      {/* Conclui o fluxo "assinar deslogado": ao autenticar, redireciona ao
          checkout da Kiwify do plano escolhido na landing (se houver intent). */}
      <CheckoutIntentRedirect />
    </UpgradeModalProvider>
    </ThemeProvider>
  );
}
