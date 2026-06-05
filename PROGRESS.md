# Kioku — Build progress

Append-only log of the autonomous build.

---

## 2026-06-05 — Step 1: Scaffold + design system

**Built**

- Hand-written Vite scaffold: `package.json`, `tsconfig.json` (+ node),
  `vite.config.ts` (vitest config merged), `postcss.config.js`, `index.html`
  (Google Fonts: Archivo Black, Manrope, DM Mono), `public/favicon.svg`.
- Installed deps: react 18, react-dom 18, react-router-dom 6, dexie 4, ts-fsrs 5
  (FSRS-6), lucide-react, jszip, sql.js; dev: vite 8, plugin-react 6, TS 6,
  tailwindcss v4 + @tailwindcss/postcss, vitest 4, types.
- `src/styles/globals.css`: full design system translated from the NeuroFluency
  brand — `@theme` tokens (bg/surface/fg/muted/line/accent + accent-blue/green/
  amber, display/body/mono fonts), brand component classes (`.btn-mega`, `.btn`,
  `.pill`, `.nav-link`, `.surface`, `.offset-shadow`, `.hover-lift`, `.field`,
  `.modal-*`, card-flip classes, `.card-content`), dark scrollbars, focus-visible,
  `prefers-reduced-motion`.
- Shared primitives: `Button` (mega/default/accent/ghost), `Pill`, `Panel`
  (raised/hover/accent-strip), `Modal` (portal, ESC + overlay close).
- `lib/cn.ts` classNames helper. `app/App.tsx` step-1 showcase (replaced in step 4).

**Decisions** — see `DECISIONS.md` (build-in-root, Panel vs Card naming,
Vite 8 / TS 6 / React-18-types version resolutions).

**Stubbed** — none.

---

## 2026-06-05 — Step 2: Data layer (Dexie + repositories + seed)

**Built**

- `db/types.ts`: full model (Deck, Card with sm2+fsrs sub-state, ReviewLog,
  MediaBlob) + `AppSettings` singleton + creation inputs + `DailyProgress`.
  Extension: per-deck `ttsLang`.
- `db/factories.ts`: `makeDeck`/`makeCard` (new cards start `new`, due now,
  fresh sm2/fsrs fields), `defaultSettings`, `DECK_COLORS` palette.
- `db/db.ts`: `KiokuDB` Dexie schema v1 — tables decks/cards/reviewLogs/media/
  settings with compound indexes `[deckId+state]`, `[deckId+due]`,
  `[deckId+reviewedAt]`.
- `db/repositories.ts`: `KiokuRepository` interface + `DexieRepository` impl
  (singleton `repo`). Persistence is behind the interface so a sync backend can
  swap in later. Includes cascade `deleteDeck`, transactional `saveReview`,
  `dailyProgress` (derives new/review counts from logs for the local day),
  stats queries, media, settings, `resetAll`.
- `db/seed.ts`: idempotent first-run seed — English vocab deck (FSRS) + General
  deck (SM-2) with sample cards; sets `seededAt`.
- `lib/date.ts`: local-day helpers (`startOfLocalDay`, `dayKey`, `daysBetween`).

**Decisions** — daily caps derived from `ReviewLog` (prevState new→newDone,
review→reviewsDone) rather than a separate counter table, avoiding sync bugs.
Orphaned media after deck delete is acceptable for v1 (GC deferred).

**Stubbed** — none.

---

## 2026-06-05 — Step 3: Scheduling (SM-2 + FSRS) + tests

**Built**

- `features/scheduling/types.ts`: `Scheduler` interface (preview/apply) +
  `RatingPreview`.
- `features/scheduling/sm2-adapter.ts`: full Anki-flavored SM-2 implemented
  verbatim from the spec (learning/relearning steps, lapses, ease floor, leech,
  fuzz on commit only, `labelInterval`).
- `features/scheduling/fsrs-adapter.ts`: ts-fsrs 5.4 (FSRS-6) adapter,
  verbatim from the spec with two required adaptations for the installed types
  (documented below).
- `features/scheduling/index.ts`: `schedulerForDeck(deck)` factory + re-exports.
- `features/scheduling/scheduler.test.ts`: 7 vitest tests — **all green**.
  SM-2: good×2→review@1, easy→review@4, again→relearning+lapse+ease−0.20, ease
  floor 1.3, good preview = oldInterval×ease (25 d). FSRS: preview 4 outcomes
  non-decreasing again→easy; apply(good) advances due + writes stability/difficulty.

**Decisions / deviations from the verbatim adapter** (required by ts-fsrs 5.4):
- `RATING` map written `as const` (not `Record<Rating, FsrsRating>`) so values
  stay literal grades and satisfy ts-fsrs's `Grade`-typed `repeat`/`next`.
- Added the `import { labelInterval } from './sm2-adapter'` the spec's note
  said was shared but omitted from the FSRS import block.

**Known limitation** — ts-fsrs 5 `Card` has a `learning_steps` field not present
in Kioku's `FsrsFields`; `toFsrs` inherits it from `createEmptyCard` (0) and
`fromFsrs` doesn't persist it, so FSRS multi-step *learning* progression resets
each review. Acceptable per the spec's verbatim adapter; noted for follow-up.

**Stubbed** — none.

---

## 2026-06-05 — Step 4: App shell + routing + sidebar

**Built**

- Added `dexie-react-hooks`; `db/hooks.ts` reactive hooks (`useDecks`, `useDeck`,
  `useCards`, `useAllCards`, `useAllLogs`, `useSettings`) — query bodies call the
  repo, Dexie live-query keeps them reactive.
- `lib/deckStats.ts` (`countCards`, `effectiveIntervalDays`, `groupCardsByDeck`,
  `MATURE_DAYS=21`), `lib/greeting.ts` (greeting + streak).
- App shell: `app/App.tsx` (BrowserRouter + routes + first-run seed on mount),
  `app/AppLayout.tsx`, `app/Sidebar.tsx` (desktop sidebar + mobile top bar,
  wordmark with accent square, nav, Recentes deck dots, version), `app/nav.ts`.
- Shared UI: `StatTile`, `PageHeader`. Deck features: `DeckCard` (accent strip,
  counts, mastery bar), `DeckBrowser` (category pills + search + grid + dashed
  create cell), `CreateDeckModal` (name/category/color/algorithm → repo.createDeck).
- Pages: **Home** (greeting, continue-reviewing banner for most-due deck, 3 stat
  tiles, deck browser), **Decks**, **ReviewHub** (deck picker). Placeholders for
  DeckDetail (step 5), ReviewSession (step 6), Stats (step 8), Settings (step 9).

**Decisions** — reactive reads via `useLiveQuery` wrapping repo calls: keeps the
repository abstraction as the read/write path while gaining Dexie reactivity
(documented tradeoff: a non-Dexie backend would replace these hooks). Review
session is a full-screen route outside the sidebar layout.

**Stubbed** — DeckDetail / ReviewSession / Stats / Settings are titled
placeholders, replaced in their numbered steps. Build + typecheck green.

**Verified** — dev server boots (vite ready 226ms); `/src/main.tsx` + `/src/app/
App.tsx` transform 200 OK over HMR.

---

## 2026-06-05 — Step 5: Deck detail + card editor (rich text + images)

**Built**

- Media layer (`features/media/media.ts`): object-URL cache, `resolveMediaHtml`
  (storage→display), `toEditorHtml`/`fromEditorHtml` (editor⇄storage with
  `data-kioku-media` tagging), `storeImage` (→ MediaBlob). `CardHtml` renders
  sanitized + media-resolved HTML. `lib/sanitize.ts` strips scripts/handlers/
  js: URLs (defends the .apkg import path).
- `RichTextField`: contentEditable + toolbar (bold/italic/underline/list/image
  via execCommand; image insert stores a MediaBlob + inserts object-URL img).
- `CardEditorModal` (add/edit + "salvar e adicionar"), `DeckSettingsModal`
  (edit name/category/color/algorithm/new+review caps/FSRS retention/buttonCount/
  ttsLang + delete with inline confirm), `CardRow` (Frente/Verso labels, state
  pill, speaker, edit/delete).
- Real **DeckDetail**: colored hero (name, counts, mastery bar, FSRS/SM-2 badge,
  Revisar agora + Adicionar card + settings), card list / empty state.
- **TTS service pulled forward** (CardRow needs it): `features/tts/tts.ts`
  (`TtsService` interface + Web Speech impl, provider-swappable) + `SpeakerButton`
  + `lib/text.ts` `stripHtml`.

**Decisions** — editor uses `document.execCommand` (deprecated but the pragmatic,
universally-supported path for a small rich-text field). Images shown via object
URLs while editing, serialized back to `kioku-media://` on save.

**Stubbed** — ReviewSession/Stats/Settings still placeholders. Step 7 will wire
TTS auto-pronounce into review + voice/rate pickers in Settings.

---

## 2026-06-05 — Step 6: Review mode + King of Buttons + keyboard

**Built**

- `features/review/queue.ts`: `buildInitialQueue` (learning-due first, reviews
  capped by reviewsPerDay−done, new capped by newPerDay−done, shuffled within
  groups) + `reinsertLearning` (in-session recurrence of lapses, no real-time
  waiting). **5 vitest tests** for queue/cap/ordering (12 total now green).
- `features/review/buttons.ts`: King of Buttons mapping (2→Errei/Acertei,
  3→Errei/Difícil/Acertei, 4→Errei/Difícil/Bom/Fácil) onto the 4 ratings.
- `useReviewSession` hook: loads deck+cards+dailyProgress, builds queue, manages
  flip/rate, applies scheduler synchronously + persists async (`saveReview`),
  re-queues learning cards, tracks counters/position/total/done. Side effects
  kept out of state-updaters (queueRef) to stay StrictMode-safe.
- `AnswerButtons` (interval preview per button, `--btn-color` role colors).
- Real **ReviewSession** page: full-screen, top bar (Sair / deck / Card X de Y /
  green-amber-red counters), 3D `rotateY` flip card (white face + offset shadow,
  accent on hover), reveal hint, Mostrar resposta CTA, answer buttons, keyboard
  (space/enter flip; 1..N rate; space=Bom when revealed; Esc exit), completion
  summary (accuracy + per-rating counts + duration). Auto-pronounce-on-reveal
  honored from settings.

**Decisions** — flip card is a click `<div>` (not `<button>`) so the per-face
SpeakerButtons aren't invalidly nested; keyboard handled by a global listener.
In-session learning steps recur via re-queue rather than wall-clock waits.

**Stubbed** — Stats/Settings still placeholders (steps 8/9).

---

## 2026-06-05 — Step 7: TTS service + speaker controls

**Built** (core service + speakers landed in steps 5–6; this step completes it)

- `features/tts/useVoices.ts`: reactive voice list (handles async `voiceschanged`).
- `components/Toggle.tsx`: brutalist on/off switch.
- `features/tts/TtsSettings.tsx`: settings block — enable, voice picker
  (auto-by-deck-language or explicit), rate slider (0.5–1.5×), auto-pronounce
  toggle, "Testar voz" — persisted via `repo.saveSettings`. Composed into the
  Settings page in step 9.

**Already in place** — `TtsService` interface + Web Speech impl (provider-
swappable), `SpeakerButton` (front+back in review, both faces; deck card list),
per-deck `ttsLang`, auto-pronounce-on-reveal wired in ReviewSession.

**Stubbed** — none for TTS. Settings page composition lands in step 9.

---

## 2026-06-05 — Step 8: Statistics + heatmap + charts

**Built**

- `features/stats/compute.ts` (pure, tested): `buildHeatmap` (16-week Sunday-
  aligned columns, 5 intensity tiers), `dailyPerformance` (14-day again/hard/
  goodEasy buckets), `sessionsFromLogs` (group logs per deck split on >30min
  gaps, score% = non-again/total), `statsSummary`. **3 tests (15 total green).**
- `Heatmap` (GitHub-style, accent `color-mix` intensity + legend), `DailyBars`
  (stacked green/amber/red, day labels + legend).
- Real **Stats** page: 4 tiles (revisões totais, aproveitamento, dominados,
  dias seguidos), heatmap panel, daily-performance panel, per-deck mastery
  bars, recent-sessions list (deck, relative date+time, cards, duration, score%).

**Stubbed** — Settings still placeholder (step 9).

---

## 2026-06-05 — Step 9: Settings

**Built**

- Real **Settings** page composing: global study defaults (new/day, reviews/day),
  default algorithm (FSRS/SM-2 cards + explanation that FSRS is the modern,
  efficient default), FSRS desired-retention slider (0.80–0.97), King of Buttons
  default (2/3/4), the `<TtsSettings/>` block, an appearance note (dark-first by
  brand), and a Data danger zone (apagar tudo → `resetAll` + reseed). All changes
  persist immediately via `repo.saveSettings`.

**Stubbed** — only `.apkg` import/export remains (step 10).
