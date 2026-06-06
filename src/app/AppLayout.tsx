import { Outlet } from 'react-router-dom';
import { MobileTopBar, Sidebar } from './Sidebar';
import { useInitialLoad } from '../db/hooks';

/** Shell with the persistent sidebar (desktop) / top bar (mobile). */
export function AppLayout() {
  const { ready, error, reload } = useInitialLoad();

  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileTopBar />
        <main className="flex-1 w-full max-w-[1200px] mx-auto px-5 md:px-8 py-7 md:py-9">
          {error && !ready ? (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <p className="text-muted">Não foi possível carregar. Tente novamente.</p>
              <button type="button" className="btn btn-accent" onClick={reload}>
                Tentar novamente
              </button>
            </div>
          ) : !ready ? (
            <div className="flex items-center justify-center py-24">
              <p className="mono text-muted text-sm">Carregando…</p>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
