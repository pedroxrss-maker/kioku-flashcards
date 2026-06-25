/**
 * App-wide opener for the upgrade modal. Any AI call site that catches a
 * QuotaError calls `openUpgrade(metric)` instead of showing a dead-end error.
 *
 * Gating: only FREE users can upgrade, so openUpgrade opens the modal and returns
 * true ONLY for them; for a paid user (who somehow hits a server cap) it returns
 * false, and the caller falls back to the plain error message.
 */
import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { UpgradeModal } from './UpgradeModal';

interface UpgradeCtx {
  /** Open the upgrade modal for an AI metric. Returns true when it opened (a free
   *  user who can upgrade) so the caller suppresses the plain error; false for a
   *  paid user (caller then shows the normal message). */
  openUpgrade: (metric: string) => boolean;
  /** Open the same plans modal PROACTIVELY (e.g. the "Fazer upgrade do plano"
   *  button in the usage popover), without an AI-limit context and regardless of
   *  the QuotaError gating. Callers decide who sees the trigger (free/basic). */
  openPlans: () => void;
}

const Ctx = createContext<UpgradeCtx>({ openUpgrade: () => false, openPlans: () => {} });

export function useUpgradeModal(): UpgradeCtx {
  return useContext(Ctx);
}

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  const { plan } = useAuth();
  const [open, setOpen] = useState(false);
  const [metric, setMetric] = useState<string | null>(null);
  const canUpgrade = plan === 'free';

  const openUpgrade = useCallback(
    (m: string): boolean => {
      if (!canUpgrade) return false; // paid user: keep the plain message
      setMetric(m);
      setOpen(true);
      return true;
    },
    [canUpgrade],
  );

  const openPlans = useCallback(() => {
    setMetric('upgrade'); // proactive open: neutral, non-limit context line
    setOpen(true);
  }, []);

  return (
    <Ctx.Provider value={{ openUpgrade, openPlans }}>
      {children}
      <UpgradeModal open={open} metric={metric} onClose={() => setOpen(false)} />
    </Ctx.Provider>
  );
}
