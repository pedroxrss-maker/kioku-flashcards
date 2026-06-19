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
}

const Ctx = createContext<UpgradeCtx>({ openUpgrade: () => false });

export function useUpgradeModal(): UpgradeCtx {
  return useContext(Ctx);
}

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  const { plan } = useAuth();
  const [metric, setMetric] = useState<string | null>(null);
  const canUpgrade = plan === 'free';

  const openUpgrade = useCallback(
    (m: string): boolean => {
      if (!canUpgrade) return false; // paid user: keep the plain message
      setMetric(m);
      return true;
    },
    [canUpgrade],
  );

  return (
    <Ctx.Provider value={{ openUpgrade }}>
      {children}
      <UpgradeModal open={metric !== null} metric={metric} onClose={() => setMetric(null)} />
    </Ctx.Provider>
  );
}
