import { Outlet } from 'react-router-dom';
import { MobileTopBar, Sidebar } from './Sidebar';

/** Shell with the persistent sidebar (desktop) / top bar (mobile). */
export function AppLayout() {
  return (
    <div className="min-h-screen md:flex">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileTopBar />
        <main className="flex-1 w-full max-w-[1200px] mx-auto px-5 md:px-8 py-7 md:py-9">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
