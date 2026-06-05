import { NavLink } from 'react-router-dom';
import { useDecks } from '../db/hooks';
import { cn } from '../lib/cn';
import { APP_VERSION, NAV_ITEMS } from './nav';
import brandLogo from '../../neurofluency-logo-branca.png';

function Wordmark() {
  return (
    <NavLink to="/" className="flex items-center gap-2.5 px-1">
      <img
        src={brandLogo}
        alt=""
        draggable={false}
        style={{ height: 26, width: 'auto' }}
      />
      <span className="display" style={{ fontSize: 22 }}>
        Kioku
      </span>
    </NavLink>
  );
}

function navItemClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex items-center gap-3 px-3 py-2.5 text-sm font-semibold transition-colors',
    'border-l-2',
    isActive
      ? 'text-fg border-l-[color:var(--accent)] bg-[color:var(--surface)]'
      : 'text-muted border-l-transparent hover:text-fg hover:bg-[color:var(--surface)]',
  );
}

/** Persistent desktop sidebar (~210px). */
export function Sidebar() {
  const decks = useDecks();
  const recent = [...decks].slice(-6).reverse();

  return (
    <aside
      className="hidden md:flex md:flex-col shrink-0 border-r-2 sticky top-0 h-screen"
      style={{ width: 210, borderColor: 'var(--line)', background: 'var(--bg)' }}
    >
      <div className="px-4 py-5">
        <Wordmark />
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={item.to} end={item.end} className={navItemClass}>
              <Icon size={18} strokeWidth={2} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {recent.length > 0 && (
        <div className="mt-7 px-4 flex-1 overflow-y-auto">
          <p className="mono text-[10px] text-muted mb-3">Recentes</p>
          <ul className="flex flex-col gap-1.5">
            {recent.map((d) => (
              <li key={d.id}>
                <NavLink
                  to={`/decks/${d.id}`}
                  className="flex items-center gap-2.5 text-[13px] text-muted hover:text-fg transition-colors py-1"
                >
                  <span
                    className="shrink-0 rounded-full"
                    style={{ width: 9, height: 9, background: d.color }}
                  />
                  <span className="truncate">{d.name}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* NeuroFluency lockup — fills the sidebar width, proportion preserved. */}
      <div className="mt-auto px-4 pt-5 pb-1" title="NeuroFluency">
        <svg
          viewBox="0 0 132 24"
          role="img"
          aria-label="NeuroFluency"
          style={{ display: 'block', width: '100%', height: 'auto' }}
        >
          <image href={brandLogo} x="0" y="1" width="22" height="22" />
          <text
            x="27"
            y="18"
            textLength="103"
            lengthAdjust="spacingAndGlyphs"
            fontFamily="Manrope, system-ui, sans-serif"
            fontWeight={800}
            fontSize="17"
          >
            <tspan fill="#ffffff">neuro</tspan><tspan fill="#ff3b1f">fluency</tspan>
          </text>
        </svg>
      </div>

      <div className="px-4 py-4 mono text-[10px] text-muted border-t" style={{ borderColor: 'var(--line)' }}>
        Kioku {APP_VERSION}
      </div>
    </aside>
  );
}

/** Mobile top bar — the sidebar collapses into this on small screens. */
export function MobileTopBar() {
  return (
    <header
      className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 border-b-2"
      style={{ borderColor: 'var(--line)', background: 'var(--bg)' }}
    >
      <Wordmark />
      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              aria-label={item.label}
              className={({ isActive }) =>
                cn(
                  'p-2 transition-colors',
                  isActive ? 'text-accent' : 'text-muted hover:text-fg',
                )
              }
            >
              <Icon size={20} />
            </NavLink>
          );
        })}
      </nav>
    </header>
  );
}
