import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
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
import { useDeckCounts, useDecks, useRecentLogs, useReviewCount, useSettings, useStreak } from '../db/hooks';
import { repo } from '../db/repositories';
import { Panel } from '../components/Panel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { HeroBackdrop, useDayPart } from '../features/home/HeroBackdrop';
import { CreateDeckModal } from '../features/decks/CreateDeckModal';
import { DeckSettingsModal } from '../features/decks/DeckSettingsModal';
import { DeckAvatar } from '../features/decks/deckIcons';
import { AlgoBadge } from '../features/decks/AlgoBadge';
import { CardCounts } from '../features/decks/CardCounts';
import { useAuth } from '../features/auth/AuthContext';
import { PlanUsageBadge } from '../features/usage/PlanUsageBadge';
import { FriendsHeaderButton } from '../features/friends/FriendsHeaderButton';
import { emptyCountSet, hasHierarchy } from '../lib/deckTree';
import { DeckTree } from '../features/decks/DeckTree';
import { DeckGrid } from '../features/decks/DeckGrid';
import { useIsMobile } from '../lib/useIsMobile';
import { greeting } from '../lib/greeting';
import { dayKey, startOfLocalDay } from '../lib/date';
import {
  accuracySince,
  decksCreatedThisMonth,
  longestStreak,
  reviewsSince,
} from '../features/stats/compute';
import type { Deck } from '../db/types';

const DAY = 86_400_000;
// Recent-activity window for streak / 7-day stats (no full review-log download).
// Covers streaks up to ~1 year; the all-time total uses a HEAD count instead.
const RECENT_LOG_DAYS = 400;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
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

/* ----------------------------------------------------------- deck row ----- */
function DeckStudyRow({
  deck,
  newCount,
  learning,
  reviewDue,
  onMenu,
  menuOpen,
  onCloseMenu,
  onConfig,
  onDelete,
}: {
  deck: Deck;
  newCount: number;
  learning: number;
  reviewDue: number;
  onMenu: () => void;
  menuOpen: boolean;
  onCloseMenu: () => void;
  onConfig: () => void;
  onDelete: () => void;
}) {
  const nav = useNavigate();
  return (
    <div
      onClick={() => nav(`/decks/${deck.id}`)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') nav(`/decks/${deck.id}`);
      }}
      className={`deck-jump${menuOpen ? ' deck-jump-locked' : ''} flex items-center gap-2 sm:gap-3 py-2.5 pl-1.5 pr-2 sm:p-3 rounded-[var(--r-sm)] hover:bg-[color:var(--surface-2)] min-w-0 cursor-pointer`}
      title={`Abrir ${deck.name}`}
    >
      <DeckAvatar deck={deck} size={40} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <p className="font-semibold truncate leading-tight">{deck.name}</p>
          {/* Wrapper carries `hidden` so it actually hides on mobile (.pill-algo's
              display:inline-flex would override `hidden` directly on the badge). */}
          <span className="shrink-0 hidden sm:inline-flex">
            <AlgoBadge algorithm={deck.algorithm} />
          </span>
        </div>
      </div>

      <CardCounts newCount={newCount} learning={learning} reviewDue={reviewDue} />

      <Link
        to={`/review/${deck.id}`}
        onClick={(e) => e.stopPropagation()}
        className="btn btn-accent btn-sm shrink-0"
        aria-label="Estudar"
      >
        <Play size={14} /> <span className="hidden sm:inline">Estudar</span>
      </Link>

      <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
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
  const deckIds = useMemo(() => decks.map((d) => d.id), [decks]);
  const counts = useDeckCounts(deckIds);
  // Bounded recent-activity window (no full review-log download). Streak/best are
  // computed from this window; all-time total comes from a HEAD count.
  const logs = useRecentLogs(RECENT_LOG_DAYS);
  const totalReviews = useReviewCount();
  // Current streak from the server (my_streak RPC) — no time-window ceiling.
  const streak = useStreak();

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false); // mobile: a lupa expande a busca
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const [createOpen, setCreateOpen] = useState(false);
  const [menuDeckId, setMenuDeckId] = useState<string | null>(null);
  const [settingsDeck, setSettingsDeck] = useState<Deck | null>(null);
  const [deckToDelete, setDeckToDelete] = useState<Deck | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const name = displayName;
  const photo = settings?.profilePhoto || null;
  // Drives both the time-of-day hero image and the greeting, live across boundaries.
  const dayPart = useDayPart();

  const deckRows = useMemo(() => {
    return decks
      .map((deck) => {
        const c = counts[deck.id] ?? emptyCountSet();
        return {
          deck,
          due: c.due,
          newCount: c.newCount,
          learning: c.learning,
          reviewDue: c.reviewDue,
        };
      })
      .sort((a, b) => b.due - a.due);
  }, [decks, counts]);

  const filteredRows = deckRows.filter((r) =>
    r.deck.name.toLowerCase().includes(query.toLowerCase().trim()),
  );

  const mostDue = deckRows.find((r) => r.due > 0) ?? deckRows[0];
  const totalDue = deckRows.reduce((n, r) => n + r.due, 0);
  const hierarchical = hasHierarchy(decks, settings?.deckPaths);

  const stats = useMemo(() => {
    const keys = new Set(logs.map((l) => dayKey(l.reviewedAt)));
    const weekAgo = Date.now() - 7 * DAY;
    const todayStart = startOfLocalDay();
    let todayMs = 0;
    let todayCount = 0;
    for (const l of logs) {
      if (l.reviewedAt >= todayStart) {
        todayMs += l.durationMs;
        todayCount += 1;
      }
    }
    return {
      totalDecks: decks.length,
      decksMonth: decksCreatedThisMonth(decks),
      totalReviews,
      reviews7d: reviewsSince(logs, weekAgo),
      streak,
      best: longestStreak(keys),
      accuracy7d: accuracySince(logs, weekAgo),
      today: todayCount,
      todayAvgSec: todayCount ? todayMs / todayCount / 1000 : 0,
    };
  }, [logs, decks, totalReviews, streak]);

  return (
    <div className="flex flex-col gap-6 rise">
      {/* Top bar */}
      <div className="sticky top-0 z-30 -mx-5 md:-mx-8 px-5 md:px-8 py-3" style={{ background: 'color-mix(in srgb, var(--bg) 88%, transparent)', backdropFilter: 'blur(8px)' }}>
        <div className="relative flex items-center gap-3">
          {/* Busca desktop: input completo, sempre visível. */}
          <div className="relative min-w-0 flex-1 hidden sm:block">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              className="field field-round"
              style={{ paddingLeft: '2.75rem' }}
              placeholder="Buscar decks, cards ou temas..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {/* Busca mobile: lupa (toca para expandir). */}
          {!searchOpen && (
            <button
              type="button"
              aria-label="Buscar"
              onClick={() => {
                setSearchOpen(true);
                requestAnimationFrame(() => searchInputRef.current?.focus());
              }}
              className="sm:hidden shrink-0 grid place-items-center rounded-full p-2.5 text-muted transition-colors hover:bg-[color:var(--surface-2)] hover:text-fg"
            >
              <Search size={18} />
            </button>
          )}
          {/* Busca mobile expandida: entra por side-slide cobrindo a linha inteira. */}
          <AnimatePresence>
            {searchOpen && (
              <motion.div
                key="search-mobile"
                className="sm:hidden absolute inset-y-0 left-0 right-0 z-10 flex items-center"
                initial={{ opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="relative w-full">
                  <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    className="field field-round"
                    style={{ paddingLeft: '2.75rem' }}
                    placeholder="Buscar decks, cards ou temas..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onBlur={() => {
                      if (!query.trim()) setSearchOpen(false);
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Ícones à direita: deslizam para fora (side-slide) e somem enquanto a busca mobile está aberta. */}
          <motion.div
            className="flex items-center gap-3"
            animate={isMobile && searchOpen ? { opacity: 0, x: 28 } : { opacity: 1, x: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{ pointerEvents: isMobile && searchOpen ? 'none' : undefined }}
          >
            <FriendsHeaderButton />
            <PlanUsageBadge />
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setUserMenuOpen((o) => !o)}
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full hover:bg-[color:var(--surface-2)] transition-colors"
              title="Conta"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
            >
              {photo ? (
                <img
                  src={photo}
                  alt=""
                  draggable={false}
                  className="rounded-full object-cover shrink-0"
                  style={{ width: 34, height: 34 }}
                />
              ) : (
                <span
                  className="flex items-center justify-center rounded-full font-bold text-white"
                  style={{ width: 34, height: 34, background: 'var(--accent)', fontSize: 13 }}
                >
                  {initials(name)}
                </span>
              )}
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </motion.div>
          {/* Sair sempre na extremidade direita (ml-auto), em qualquer tela. */}
          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Sair"
            title="Sair"
            className="ml-auto inline-flex shrink-0 items-center justify-center rounded-[var(--r-sm)] p-2.5 text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)' }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Greeting hero — illustrated time-of-day backdrop behind the welcome + CTA */}
      <Panel className="relative overflow-hidden">
        <HeroBackdrop part={dayPart} />
        {/* Contrast scrim: darker on the left where the text sits. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(100deg, rgba(8,8,12,0.9) 0%, rgba(8,8,12,0.62) 44%, rgba(8,8,12,0.12) 100%)',
          }}
          aria-hidden
        />
        <div className="relative p-5 md:p-7 flex flex-col gap-4 min-h-[208px] md:min-h-[236px]">
          <div className="flex-1">
            <h1 className="display" style={{ fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 600 }}>
              {greeting()}, {name}! 👋
            </h1>
            <p className="text-muted mt-1">Pronto para mais uma sessão de estudos?</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => mostDue && nav(`/review/${mostDue.deck.id}`)}
              disabled={!mostDue}
            >
              <Play size={16} /> Estudar agora
            </button>
            {totalDue > 0 && (
              <span className="pill" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                {totalDue} a revisar
              </span>
            )}
          </div>
        </div>
      </Panel>

      {/* Stat cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon={Layers} label="Decks criados" value={stats.totalDecks} sub={`+${stats.decksMonth} este mês`} color="var(--accent-blue)" />
        <StatCard icon={CheckCircle2} label="Cards estudados" value={stats.totalReviews} sub={`+${stats.reviews7d} esta semana`} color="var(--accent-green)" />
        <StatCard icon={Flame} label="Sequência atual" value={`${stats.streak} ${stats.streak === 1 ? 'dia' : 'dias'}`} sub={`Melhor: ${stats.best} dias`} color="var(--accent)" iconClassName="flame-anim" />
        <StatCard icon={Target} label="Taxa de acertos" value={`${stats.accuracy7d}%`} sub="Últimos 7 dias" color="#b14cff" />
      </section>

      {/* Continue studying — full width */}
      <Panel className="p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="display truncate shrink-0" style={{ fontSize: 19, fontWeight: 600 }}>
              Continuar estudando
            </h2>
            <span className="mono text-xs text-muted hidden md:block truncate">
              {stats.today} cards revisados hoje · {stats.todayAvgSec.toFixed(1)}s/card
            </span>
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
          ) : (
            <>
              {/* Mobile: 2-column grid of color deck cards (tap opens the deck
                  overview, no "Estudar" button; decks with subdecks expand). */}
              <div className="sm:hidden">
                <DeckGrid decks={decks} counts={counts} query={query} maxRows={6} />
              </div>

              {/* Desktop: the existing rows / nested collapsible tree. */}
              <div className="hidden sm:block">
                {hierarchical ? (
                  <DeckTree
                    decks={decks}
                    counts={counts}
                    query={query}
                    maxRows={8}
                    onConfig={(d) => setSettingsDeck(d)}
                    onDelete={(d) => setDeckToDelete(d)}
                  />
                ) : (
                  <div className="flex flex-col gap-1">
                    {filteredRows.slice(0, 5).map((r) => (
                      <DeckStudyRow
                        key={r.deck.id}
                        deck={r.deck}
                        newCount={r.newCount}
                        learning={r.learning}
                        reviewDue={r.reviewDue}
                        menuOpen={menuDeckId === r.deck.id}
                        onMenu={() => setMenuDeckId((id) => (id === r.deck.id ? null : r.deck.id))}
                        onCloseMenu={() => setMenuDeckId(null)}
                        onConfig={() => setSettingsDeck(r.deck)}
                        onDelete={() => setDeckToDelete(r.deck)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
      </Panel>

      <CreateDeckModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {settingsDeck && (
        <DeckSettingsModal open onClose={() => setSettingsDeck(null)} deck={settingsDeck} />
      )}
      <ConfirmDialog
        open={!!deckToDelete}
        onClose={() => setDeckToDelete(null)}
        onConfirm={() => {
          if (deckToDelete) void repo.deleteDeck(deckToDelete.id);
        }}
        title="Excluir deck"
        message={
          deckToDelete
            ? `Excluir o deck "${deckToDelete.name}" e todos os cards? Esta ação não pode ser desfeita.`
            : ''
        }
      />
    </div>
  );
}
