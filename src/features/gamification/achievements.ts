/**
 * Achievements (gamification Phase 2).
 *
 * A flat registry of achievement definitions, each with a pure `check(metrics)`
 * predicate. The metrics are derived once per evaluation from already-persisted
 * data (review_logs, cards, decks, profiles) using the same stats helpers the
 * app already ships — so everything here is detectable retroactively, no new
 * event tracking.
 *
 * `evaluateAchievements()` is the single idempotent pass: it unlocks anything
 * newly qualified (idempotent via the unique(user_id, achievement_key) DB
 * constraint) and celebrates only genuine new unlocks. On the FIRST ever run for
 * a user it seeds their history silently (one summary banner, not dozens),
 * gating on a `settings.achievementsSeededAt` flag.
 */
import { repo } from '../../db/repositories';
import { celebrate } from './celebration';
import {
  longestStreak,
  reviewsByDay,
  statsSummary,
  studiedToday,
} from '../stats/compute';
import { countCardStates } from '../../lib/deckStats';
import { dayKey } from '../../lib/date';
import type { AppSettings, Card, Deck, ReviewLog } from '../../db/types';

export type AchievementCategory =
  | 'milestones'
  | 'creator'
  | 'streaks'
  | 'dedication'
  | 'mastery'
  | 'goals'
  | 'features';

/** Category headings (pt-BR), in the order the Awards page lists them. */
export const CATEGORY_ORDER: AchievementCategory[] = [
  'milestones',
  'creator',
  'streaks',
  'dedication',
  'mastery',
  'goals',
  'features',
];
export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  milestones: 'Marcos',
  creator: 'Criador',
  streaks: 'Sequências',
  dedication: 'Dedicação',
  mastery: 'Maestria',
  goals: 'Meta diária',
  features: 'Recursos',
};

/** The metrics every achievement is checked against (computed once per run). */
export interface AchievementMetrics {
  totalReviews: number;
  cardCount: number;
  deckCount: number;
  longest: number; // longest streak ever (so a later break never un-earns)
  studyDays: number; // distinct local days with >=1 review
  mastered: number; // mature cards (interval >= 21d)
  studiedToday: number;
  dailyGoal: number;
  daysGoalMet: number; // distinct days that met the (current) daily goal
  hasAudio: boolean;
  hasImage: boolean;
}

export interface AchievementDef {
  key: string;
  name: string;
  description: string;
  category: AchievementCategory;
  check: (m: AchievementMetrics) => boolean;
}

/** The lean essential set — exactly 19 achievements. */
export const ACHIEVEMENTS: AchievementDef[] = [
  // Marcos / Revisões
  { key: 'reviews_1', name: 'Primeiros Passos', description: 'Revise seu primeiro card.', category: 'milestones', check: (m) => m.totalReviews >= 1 },
  { key: 'reviews_100', name: 'Centurião', description: 'Revise 100 cards.', category: 'milestones', check: (m) => m.totalReviews >= 100 },
  { key: 'reviews_1000', name: 'Milênio', description: 'Revise 1.000 cards.', category: 'milestones', check: (m) => m.totalReviews >= 1000 },
  { key: 'reviews_10000', name: 'Mestre da Memória', description: 'Revise 10.000 cards.', category: 'milestones', check: (m) => m.totalReviews >= 10000 },

  // Criador
  { key: 'cards_1', name: 'Primeiro Card', description: 'Crie seu primeiro card.', category: 'creator', check: (m) => m.cardCount >= 1 },
  { key: 'decks_1', name: 'Primeiro Deck', description: 'Crie seu primeiro deck.', category: 'creator', check: (m) => m.deckCount >= 1 },
  { key: 'decks_5', name: 'Construtor de Decks', description: 'Crie 5 decks.', category: 'creator', check: (m) => m.deckCount >= 5 },

  // Sequências (unlock on longest streak ever)
  { key: 'streak_3', name: 'Faísca', description: 'Estude 3 dias seguidos.', category: 'streaks', check: (m) => m.longest >= 3 },
  { key: 'streak_7', name: 'Guerreiro da Semana', description: 'Estude 7 dias seguidos.', category: 'streaks', check: (m) => m.longest >= 7 },
  { key: 'streak_30', name: 'Mestre do Mês', description: 'Estude 30 dias seguidos.', category: 'streaks', check: (m) => m.longest >= 30 },
  { key: 'streak_100', name: 'Imparável', description: 'Estude 100 dias seguidos.', category: 'streaks', check: (m) => m.longest >= 100 },

  // Dedicação
  { key: 'days_7', name: 'Frequente', description: 'Estude em 7 dias diferentes.', category: 'dedication', check: (m) => m.studyDays >= 7 },
  { key: 'days_100', name: 'Devoto', description: 'Estude em 100 dias diferentes.', category: 'dedication', check: (m) => m.studyDays >= 100 },

  // Maestria
  { key: 'mastered_1', name: 'Primeira Maestria', description: 'Domine seu primeiro card (intervalo de 21+ dias).', category: 'mastery', check: (m) => m.mastered >= 1 },
  { key: 'mastered_250', name: 'Sábio', description: 'Domine 250 cards.', category: 'mastery', check: (m) => m.mastered >= 250 },

  // Meta diária
  { key: 'goal_today', name: 'Meta Batida', description: 'Cumpra sua meta diária de cards.', category: 'goals', check: (m) => m.dailyGoal > 0 && m.studiedToday >= m.dailyGoal },
  { key: 'goal_days_7', name: 'Constante', description: 'Cumpra a meta diária em 7 dias diferentes.', category: 'goals', check: (m) => m.daysGoalMet >= 7 },

  // Recursos
  { key: 'feat_audio', name: 'Audiófilo', description: 'Gere áudio (TTS) para um card.', category: 'features', check: (m) => m.hasAudio },
  { key: 'feat_image', name: 'Ilustrador', description: 'Adicione uma imagem a um card.', category: 'features', check: (m) => m.hasImage },
];

interface AchievementContext {
  logs: ReviewLog[];
  cards: Card[];
  decks: Deck[];
  settings: AppSettings;
}

/** Derive every metric from the persisted data, once. */
export function computeMetrics(ctx: AchievementContext): AchievementMetrics {
  const { logs, cards, decks, settings } = ctx;
  const dayKeys = new Set(logs.map((l) => dayKey(l.reviewedAt)));
  const deckById = new Map(decks.map((d) => [d.id, d]));
  const byDay = reviewsByDay(logs);
  const dailyGoal = settings.dailyGoal > 0 ? settings.dailyGoal : 0;

  let daysGoalMet = 0;
  if (dailyGoal > 0) for (const n of byDay.values()) if (n >= dailyGoal) daysGoalMet += 1;

  const cardAudio = settings.cardAudio ?? {};
  const hasAudio =
    cards.some((c) => !!c.audioPath) ||
    Object.values(cardAudio).some((v) => !!v && (!!v.front || !!v.back));
  const hasImage = cards.some((c) => /<img/i.test(c.front) || /<img/i.test(c.back));

  return {
    totalReviews: statsSummary(logs).totalReviews,
    cardCount: cards.length,
    deckCount: decks.length,
    longest: longestStreak(dayKeys),
    studyDays: dayKeys.size,
    mastered: countCardStates(cards, deckById).mature,
    studiedToday: studiedToday(logs),
    dailyGoal,
    daysGoalMet,
    hasAudio,
    hasImage,
  };
}

async function loadContext(): Promise<AchievementContext> {
  // Read fresh so an evaluation right after a review/create sees the new data.
  const [logs, cards, decks, settings] = await Promise.all([
    repo.allLogs(),
    repo.allCards(),
    repo.listDecks(),
    repo.getSettings(),
  ]);
  return { logs, cards, decks, settings };
}

let running = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced trigger — coalesces bursts (e.g. bulk card import) into one pass. */
export function scheduleAchievementCheck(delay = 800): void {
  if (typeof window === 'undefined') return;
  if (debounceTimer != null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void evaluateAchievements();
  }, delay);
}

/**
 * The single idempotent evaluation. Unlocks anything newly qualified and
 * celebrates only genuine new unlocks:
 *  - First ever run (no `achievementsSeededAt`): seed silently, then ONE summary
 *    banner, and stamp the flag — so an existing user isn't spammed with dozens.
 *  - Afterwards: 1-3 new -> individual banners (queued); >3 -> one summary.
 */
export async function evaluateAchievements(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const ctx = await loadContext();
    const metrics = computeMetrics(ctx);
    const firstRun = ctx.settings.achievementsSeededAt == null;
    const unlocked = new Set((await repo.listAchievements()).map((a) => a.key));
    const qualified = ACHIEVEMENTS.filter((a) => !unlocked.has(a.key) && a.check(metrics));

    // Persist; unlockAchievement returns true only for a real (new) insert, so
    // the celebration can never re-fire for an already-earned one.
    const inserted: AchievementDef[] = [];
    for (const a of qualified) {
      if (await repo.unlockAchievement(a.key)) inserted.push(a);
    }

    if (firstRun) {
      await repo.saveSettings({ achievementsSeededAt: Date.now() });
      if (inserted.length > 0) {
        celebrate({
          kind: 'achievement',
          title: inserted.length === 1 ? 'Conquista desbloqueada!' : 'Conquistas desbloqueadas!',
          message:
            inserted.length === 1
              ? `Você ganhou "${inserted[0].name}".`
              : `Você ganhou ${inserted.length} conquistas pelo seu progresso até aqui.`,
        });
      }
      return;
    }

    if (inserted.length === 0) return;
    if (inserted.length <= 3) {
      for (const a of inserted) {
        celebrate({ kind: 'achievement', title: a.name, message: a.description });
      }
    } else {
      celebrate({
        kind: 'achievement',
        title: `${inserted.length} conquistas desbloqueadas!`,
        message: 'Abra a página de Conquistas para ver todas.',
      });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[achievements] evaluation failed', err);
  } finally {
    running = false;
  }
}
