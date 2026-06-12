import { NavLink } from 'react-router-dom';
import { useAllLogs, useDecks, useSettings } from '../db/hooks';
import { studiedToday } from '../features/stats/compute';
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
    'flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-[var(--r-sm)] transition-colors',
    isActive
      ? 'text-fg bg-[color:var(--accent-soft)]'
      : 'text-muted hover:text-fg hover:bg-[color:var(--surface-2)]',
  );
}

/** Compact daily-goal: a small progress ring with today's count + the goal. */
function DailyGoalMini() {
  const logs = useAllLogs();
  const settings = useSettings();
  const goal = settings?.dailyGoal ?? 40;
  const today = studiedToday(logs);
  const pct = goal > 0 ? Math.min(1, today / goal) : 0;
  const size = 48;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="mt-auto px-4 pt-4 flex items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .5s ease' }}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="var(--display)"
          fontWeight={700}
          fontSize="13"
          fill="var(--fg)"
        >
          {today}
        </text>
      </svg>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold leading-tight">Meta diária</p>
        <p className="mono text-[10px] text-muted">
          {today}/{goal} cards
        </p>
      </div>
    </div>
  );
}

/** Persistent desktop sidebar (~210px). */
export function Sidebar() {
  const decks = useDecks();
  const recent = [...decks].slice(-6).reverse();

  return (
    <aside
      className="hidden md:flex md:flex-col shrink-0 border-r sticky top-0 h-screen"
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
                  className="recent-deck flex items-center gap-2.5 text-[13px] text-muted hover:text-fg py-1"
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

      <DailyGoalMini />

      {/* NeuroFluency lockup — fills the sidebar width, proportion preserved. */}
      <div className="px-4 pt-5 pb-1" title="NeuroFluency">
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
      className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 border-b"
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
