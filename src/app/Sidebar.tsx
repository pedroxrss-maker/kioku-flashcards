import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { useRecentLogs, useSettings } from '../db/hooks';
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
        className="brand-logo-mark"
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
    // `nav-jump` adds the same hover "jump" the Recentes items have (and carries
    // its own color/background transitions, so transition-colors is dropped).
    'nav-jump flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-[var(--r-sm)]',
    isActive
      ? 'nav-active'
      : 'text-muted hover:text-fg hover:bg-[color:var(--surface-2)]',
  );
}

/** Compact daily-goal: a small progress ring with today's count + the goal. */
function DailyGoalMini() {
  // Only today's count is needed — a 2-day window, never the whole log.
  const logs = useRecentLogs(2);
  const settings = useSettings();
  const goal = settings?.dailyGoal ?? 40;
  const today = studiedToday(logs);
  const pct = goal > 0 ? Math.min(1, today / goal) : 0;
  const size = 48;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="mt-auto px-4 pt-4">
      <div
        className="flex items-center gap-3 p-3 rounded-[var(--r-md)]"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--ring-track)"
            strokeWidth={stroke}
          />
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
            fontSize="14"
            fill="var(--fg)"
          >
            {today}
          </text>
        </svg>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">Meta diária</p>
          <p className="text-xs text-muted mt-0.5">
            {today}/{goal} cards
          </p>
        </div>
      </div>
    </div>
  );
}

/** Persistent desktop sidebar (~210px). */
export function Sidebar() {
  return (
    <aside
      className="hidden md:flex md:flex-col shrink-0 border-r sticky top-0 h-screen"
      style={{ width: 210, borderColor: 'var(--line)', background: 'var(--sidebar-bg)' }}
    >
      <div className="px-4 py-5">
        <Wordmark />
      </div>

      <nav className="flex flex-col gap-1 px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={item.to} end={item.end} className={navItemClass}>
              {/* Ícone colorido por item, sem o bloco quadrado (só o ícone). */}
              <Icon size={18} strokeWidth={2} className="shrink-0" style={{ color: item.color }} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Espaçador: empurra a meta diária + rodapé para a base da sidebar. */}
      <div className="flex-1" aria-hidden />

      <DailyGoalMini />

      {/* NeuroFluency lockup — fills the sidebar width, proportion preserved. */}
      <div className="px-4 pt-5 pb-1" title="NeuroFluency">
        <svg
          viewBox="0 0 132 24"
          role="img"
          aria-label="NeuroFluency"
          style={{ display: 'block', width: '100%', height: 'auto' }}
        >
          <image href={brandLogo} x="0" y="1" width="22" height="22" className="brand-logo-mark" />
          <text
            x="27"
            y="18"
            textLength="103"
            lengthAdjust="spacingAndGlyphs"
            fontFamily="Manrope, system-ui, sans-serif"
            fontWeight={800}
            fontSize="17"
          >
            <tspan className="brand-neuro">neuro</tspan><tspan className="brand-fluency">fluency</tspan>
          </text>
        </svg>
      </div>

      <div className="px-4 py-4 mono text-[10px] text-muted border-t" style={{ borderColor: 'var(--line)' }}>
        Kioku {APP_VERSION}
      </div>
    </aside>
  );
}

/** Mobile top bar — the sidebar collapses into this on small screens: a brand
 *  row (wordmark + bell) above a 4-tab icon nav with a sliding active underline. */
export function MobileTopBar() {
  return (
    <header
      className="md:hidden sticky top-0 z-40 border-b"
      style={{ borderColor: 'var(--line)', background: 'var(--sidebar-bg)' }}
    >
      <div className="flex items-center justify-between px-4 h-14">
        <Wordmark />
        <div className="-mr-2">
          <NotificationBell />
        </div>
      </div>
      <nav className="grid grid-cols-5">
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
                  'relative flex items-center justify-center py-3 transition-colors',
                  isActive ? 'text-accent' : 'text-muted hover:text-fg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} />
                  {isActive && (
                    <motion.span
                      layoutId="mobilenav-underline"
                      transition={{ type: 'spring', stiffness: 480, damping: 40 }}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        marginInline: 'auto',
                        width: 26,
                        height: 2,
                        background: 'var(--accent)',
                        borderRadius: 2,
                      }}
                    />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </header>
  );
}
