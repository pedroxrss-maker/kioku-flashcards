import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Flame,
  Layers,
  LogOut,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Search,
  Settings2,
  Target,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAllCards, useAllLogs, useDecks, useSettings } from '../db/hooks';
import { repo } from '../db/repositories';
import { Panel } from '../components/Panel';
import { Heatmap } from '../features/stats/Heatmap';
import { ProgressChart } from '../features/stats/ProgressChart';
import { CreateDeckModal } from '../features/decks/CreateDeckModal';
import { DeckSettingsModal } from '../features/decks/DeckSettingsModal';
import { DeckAvatar } from '../features/decks/deckIcons';
import { AlgoBadge } from '../features/decks/AlgoBadge';
import { useAuth } from '../features/auth/AuthContext';
import { countCards, groupCardsByDeck } from '../lib/deckStats';
import { hasHierarchy } from '../lib/deckTree';
import { DeckTree } from '../features/decks/DeckTree';
import { computeStreak } from '../lib/greeting';
import { dayKey } from '../lib/date';
import {
  accuracySince,
  decksCreatedThisMonth,
  longestStreak,
  recentActivity,
  reviewsSince,
  studiedToday,
} from '../features/stats/compute';
import type { Deck } from '../db/types';

const DAY = 86_400_000;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Agora';
  if (diff < 3_600_000) return `Há ${Math.floor(diff / 60_000)}min`;
  if (diff < DAY) return `Há ${Math.floor(diff / 3_600_000)}h`;
  return `Há ${Math.floor(diff / DAY)}d`;
}

/* ------------------------------------------------------------- stat card -- */
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'var(--accent)',
  iconClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub: string;
  color?: string;
  iconClassName?: string;
}) {
  return (
    <Panel className="p-3 md:p-4 flex items-center gap-3">
      <span
        className="icon-tile shrink-0"
        style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
      >
        <Icon size={18} className={iconClassName} />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted truncate">{label}</p>
        <p className="display" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>
          {value}
        </p>
        <p className="text-[11px] mt-0.5 truncate" style={{ color }}>{sub}</p>
      </div>
    </Panel>
  );
}

/* --------------------------------------------------------- daily ring ----- */
function DailyRing({ value, goal }: { value: number; goal: number }) {
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const size = 132;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
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
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--display)"
        fontWeight={700}
        fontSize="24"
        fill="var(--fg)"
      >
        {value}/{goal}
      </text>
    </svg>
  );
}

/* ----------------------------------------------------------- deck row ----- */
function DeckStudyRow({
  deck,
  count,
  pct,
  onMenu,
  menuOpen,
  onCloseMenu,
  onConfig,
  onDelete,
}: {
  deck: Deck;
  count: number;
  pct: number;
  onMenu: () => void;
  menuOpen: boolean;
  onCloseMenu: () => void;
  onConfig: () => void;
  onDelete: () => void;
}) {
  const nav = useNavigate();
  return (
    <div
      className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-[var(--r-sm)] transition-colors hover:bg-[color:var(--surface-2)] min-w-0"
    >
      <DeckAvatar deck={deck} size={40} />

      <div className="min-w-0 flex-1">
        <p className="font-semibold truncate leading-tight">{deck.name}</p>
        <div className="flex items-center gap-2 mb-1.5 min-w-0">
          <p className="text-xs text-muted truncate">{count} cards</p>
          <AlgoBadge algorithm={deck.algorithm} className="shrink-0" />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-1.5 flex-1 min-w-0 rounded-full" style={{ background: 'var(--surface-2)' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 999 }} />
          </div>
          <span className="text-[11px] text-muted shrink-0 w-9 text-right">{pct}%</span>
        </div>
      </div>

      <Link to={`/review/${deck.id}`} className="btn btn-accent btn-sm shrink-0" aria-label="Estudar">
        <Play size={14} /> <span className="hidden sm:inline">Estudar</span>
      </Link>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Mais opções"
          className="p-2 rounded-[var(--r-sm)] text-muted hover:text-fg hover:bg-[color:var(--surface-2)] transition-colors"
        >
          <MoreVertical size={18} />
        </button>
        {menuOpen && <div className="fixed inset-0 z-40" onClick={onCloseMenu} />}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              key="deckmenu"
              className="absolute right-0 z-50 mt-1 w-44 py-1"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              style={{
                transformOrigin: 'top right',
                background: 'var(--surface)',
                border: '1px solid var(--line-strong)',
                borderRadius: 'var(--r-md)',
                boxShadow: 'var(--shadow-pop)',
              }}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-[color:var(--surface-2)] transition-colors"
                onClick={() => {
                  onCloseMenu();
                  nav(`/decks/${deck.id}`);
                }}
              >
                <Pencil size={14} /> Editar
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-[color:var(--surface-2)] transition-colors"
                onClick={() => {
                  onCloseMenu();
                  onConfig();
                }}
              >
                <Settings2 size={14} /> Configurações
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-accent hover:bg-[color:var(--surface-2)] transition-colors"
                onClick={() => {
                  onCloseMenu();
                  onDelete();
                }}
              >
                <Trash2 size={14} /> Excluir
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ================================================================ Home ==== */
export function Home() {
  const nav = useNavigate();
  const { displayName, signOut } = useAuth();
  const settings = useSettings();
  const decks = useDecks();
  const allCards = useAllCards();
  const logs = useAllLogs();

  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [menuDeckId, setMenuDeckId] = useState<string | null>(null);
  const [settingsDeck, setSettingsDeck] = useState<Deck | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const name = displayName;
  const goal = settings?.dailyGoal ?? 40;

  const byDeck = useMemo(() => groupCardsByDeck(allCards), [allCards]);

  const deckRows = useMemo(() => {
    const now = Date.now();
    return decks
      .map((deck) => {
        const c = countCards(byDeck.get(deck.id) ?? [], now, deck);
        return {
          deck,
          count: c.total,
          due: c.due,
          pct: c.total ? Math.round((c.mastered / c.total) * 100) : 0,
        };
      })
      .sort((a, b) => b.due - a.due);
  }, [decks, byDeck]);

  const filteredRows = deckRows.filter((r) =>
    r.deck.name.toLowerCase().includes(query.toLowerCase().trim()),
  );

  const mostDue = deckRows.find((r) => r.due > 0) ?? deckRows[0];
  const hierarchical = hasHierarchy(decks, settings?.deckPaths);

  const stats = useMemo(() => {
    const keys = new Set(logs.map((l) => dayKey(l.reviewedAt)));
    const weekAgo = Date.now() - 7 * DAY;
    return {
      totalDecks: decks.length,
      decksMonth: decksCreatedThisMonth(decks),
      totalReviews: logs.length,
      reviews7d: reviewsSince(logs, weekAgo),
      streak: computeStreak(keys),
      best: longestStreak(keys),
      accuracy7d: accuracySince(logs, weekAgo),
      today: studiedToday(logs),
    };
  }, [logs, decks]);

  const activity = useMemo(() => recentActivity(logs, decks, 4), [logs, decks]);
  const remaining = Math.max(0, goal - stats.today);
  const dailyPct = goal > 0 ? Math.min(100, Math.round((stats.today / goal) * 100)) : 0;

  return (
    <div className="flex flex-col gap-6 rise">
      {/* Top bar */}
      <div className="sticky top-0 z-30 -mx-5 md:-mx-8 px-5 md:px-8 py-3" style={{ background: 'color-mix(in srgb, var(--bg) 88%, transparent)', backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              className="field field-round"
              style={{ paddingLeft: '2.75rem' }}
              placeholder="Buscar decks, cards ou temas..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            aria-label="Notificações"
            className="p-2.5 rounded-[var(--r-sm)] text-muted hover:text-fg transition-colors shrink-0"
            style={{ background: 'var(--surface-2)' }}
          >
            <Bell size={18} />
          </button>
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setUserMenuOpen((o) => !o)}
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full hover:bg-[color:var(--surface-2)] transition-colors"
              title="Conta"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
            >
              <span
                className="flex items-center justify-center rounded-full font-bold text-white"
                style={{ width: 34, height: 34, background: 'var(--accent)', fontSize: 13 }}
              >
                {initials(name)}
              </span>
              <span className="text-sm hidden sm:inline">Olá, {name}</span>
              <ChevronDown size={15} className="text-muted hidden sm:inline" />
            </button>
            {userMenuOpen && (
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
            )}
            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  key="usermenu"
                  className="absolute right-0 z-50 mt-1 w-48 py-1"
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    transformOrigin: 'top right',
                    background: 'var(--surface)',
                    border: '1px solid var(--line-strong)',
                    borderRadius: 'var(--r-md)',
                    boxShadow: 'var(--shadow-pop)',
                  }}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-[color:var(--surface-2)] transition-colors"
                    onClick={() => {
                      setUserMenuOpen(false);
                      nav('/settings');
                    }}
                  >
                    <Settings2 size={14} /> Configurações
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-accent hover:bg-[color:var(--surface-2)] transition-colors"
                    onClick={() => {
                      setUserMenuOpen(false);
                      void signOut();
                    }}
                  >
                    <LogOut size={14} /> Sair
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Greeting */}
      <header>
        <h1 className="display" style={{ fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 600 }}>
          Bem-vindo de volta, {name}! 👋
        </h1>
        <p className="text-muted mt-1">Pronto para mais uma sessão de estudos?</p>
      </header>

      {/* Stat cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon={Layers} label="Decks criados" value={stats.totalDecks} sub={`+${stats.decksMonth} este mês`} color="var(--accent-blue)" />
        <StatCard icon={CheckCircle2} label="Cards estudados" value={stats.totalReviews} sub={`+${stats.reviews7d} esta semana`} color="var(--accent-green)" />
        <StatCard icon={Flame} label="Sequência atual" value={`${stats.streak} ${stats.streak === 1 ? 'dia' : 'dias'}`} sub={`Melhor: ${stats.best} dias`} color="var(--accent)" iconClassName="flame-anim" />
        <StatCard icon={Target} label="Taxa de acertos" value={`${stats.accuracy7d}%`} sub="Últimos 7 dias" color="#b14cff" />
      </section>

      {/* Review heatmap */}
      <Panel className="p-4 md:p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays size={16} className="text-muted" />
          <h2 className="mono text-sm text-muted">Mapa de revisões</h2>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-start gap-5">
          <div className="min-w-0 lg:flex-1">
            <Heatmap logs={logs} />
          </div>
          <div
            className="border-t pt-5 lg:border-t-0 lg:pt-0 lg:border-l lg:pl-5 lg:flex-1 min-w-0"
            style={{ borderColor: 'var(--line)' }}
          >
            <ProgressChart logs={logs} />
          </div>
        </div>
      </Panel>

      {/* Continue studying — full width */}
      <Panel className="p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="display truncate" style={{ fontSize: 19, fontWeight: 600 }}>
              Continuar estudando
            </h2>
            <Link to="/decks" className="text-sm text-accent hover:underline shrink-0 whitespace-nowrap">
              Ver todos<span className="hidden sm:inline"> os decks</span>
            </Link>
          </div>

          {filteredRows.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-muted">
                {query ? `Nenhum deck para “${query}”.` : 'Você ainda não tem decks.'}
              </p>
              <button className="btn btn-accent mt-4" onClick={() => setCreateOpen(true)}>
                <Plus size={16} /> Criar deck
              </button>
            </div>
          ) : hierarchical ? (
            /* Nested, collapsible tree when subdecks exist. */
            <DeckTree
              decks={decks}
              cardsByDeck={byDeck}
              query={query}
              maxRows={8}
              onConfig={(d) => setSettingsDeck(d)}
              onDelete={(d) => {
                // eslint-disable-next-line no-alert
                if (window.confirm(`Excluir o deck "${d.name}" e todos os cards?`)) {
                  void repo.deleteDeck(d.id);
                }
              }}
            />
          ) : (
            <div className="flex flex-col gap-1">
              {filteredRows.slice(0, 5).map((r) => (
                <DeckStudyRow
                  key={r.deck.id}
                  deck={r.deck}
                  count={r.count}
                  pct={r.pct}
                  menuOpen={menuDeckId === r.deck.id}
                  onMenu={() => setMenuDeckId((id) => (id === r.deck.id ? null : r.deck.id))}
                  onCloseMenu={() => setMenuDeckId(null)}
                  onConfig={() => setSettingsDeck(r.deck)}
                  onDelete={() => {
                    if (
                      // eslint-disable-next-line no-alert
                      window.confirm(`Excluir o deck "${r.deck.name}" e todos os cards?`)
                    ) {
                      void repo.deleteDeck(r.deck.id);
                    }
                  }}
                />
              ))}
            </div>
          )}
      </Panel>

      {/* Daily progress + recent activity — balanced 2-column row */}
      <section className="grid lg:grid-cols-2 gap-4 md:gap-5 items-start">
        {/* Daily progress */}
        <Panel className="p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="display" style={{ fontSize: 17, fontWeight: 600 }}>
                Progresso diário
              </h2>
              <span className="pill pill-muted" style={{ padding: '3px 10px', fontSize: 12 }}>
                Hoje
              </span>
            </div>
            <div className="flex flex-col items-center text-center">
              <DailyRing value={stats.today} goal={goal} />
              <p className="text-sm text-muted mt-3">Cards estudados hoje</p>
              <p className="text-sm mt-1">
                {remaining > 0
                  ? `Faltam ${remaining} cards para bater sua meta diária!`
                  : 'Meta diária batida! 🎉'}
              </p>
              <div className="h-1.5 w-full rounded-full mt-3" style={{ background: 'var(--surface-2)' }}>
                <div style={{ width: `${dailyPct}%`, height: '100%', background: 'var(--accent)', borderRadius: 999, transition: 'width .4s ease' }} />
              </div>
              <button
                className="btn btn-ghost mt-4 w-full"
                style={{ color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)' }}
                onClick={() => mostDue && nav(`/review/${mostDue.deck.id}`)}
                disabled={!mostDue}
              >
                <Play size={15} /> Estudar agora
              </button>
            </div>
          </Panel>

          {/* Recent activity */}
          <Panel className="p-4 md:p-5">
            <h2 className="display mb-3" style={{ fontSize: 17, fontWeight: 600 }}>
              Atividade recente
            </h2>
            {activity.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma atividade ainda.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {activity.map((a, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span
                      className="flex items-center justify-center rounded-full shrink-0 mt-0.5"
                      style={{
                        width: 28,
                        height: 28,
                        background: a.kind === 'session' ? 'color-mix(in srgb, var(--accent-green) 18%, transparent)' : 'color-mix(in srgb, var(--accent-amber) 18%, transparent)',
                        color: a.kind === 'session' ? 'var(--accent-green)' : 'var(--accent-amber)',
                      }}
                    >
                      {a.kind === 'session' ? <CheckCircle2 size={15} /> : <Plus size={15} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-tight">{a.main}</p>
                      <p className="text-xs text-muted truncate">{a.sub}</p>
                    </div>
                    <span className="text-xs text-muted shrink-0">{formatAgo(a.time)}</span>
                  </div>
                ))}
              </div>
            )}
            <Link to="/stats" className="block text-sm text-accent hover:underline mt-4">
              Ver toda atividade
            </Link>
          </Panel>
      </section>

      <CreateDeckModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {settingsDeck && (
        <DeckSettingsModal open onClose={() => setSettingsDeck(null)} deck={settingsDeck} />
      )}
    </div>
  );
}
