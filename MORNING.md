# Kioku — Morning report

Built overnight, autonomously, from the BUILD SPEC. All 10 numbered steps are
implemented. The project **type-checks, builds, and passes 19 tests**.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Other commands:

```bash
npm run build      # tsc --noEmit && vite build  (production build into dist/)
npm run preview    # serve the production build
npm test           # vitest run (19 tests)
npm run test:watch # vitest in watch mode
npm run typecheck  # tsc --noEmit
```

Node ≥ 20 required (ts-fsrs). Built and tested on Node 24.

First run seeds two sample decks (English vocab → FSRS, Conhecimentos Gerais →
SM-2) so the UI is never empty. All data is local (IndexedDB via Dexie).

---

## What is fully working

- **Design system** — NeuroFluency brand translated to Tailwind v4 tokens +
  brand component classes (btn-mega, pill, nav-link, offset solid shadows, hard
  edges, card flip, `prefers-reduced-motion`, `::selection`). Dark-first.
- **Data layer** — Dexie schema (decks/cards/reviewLogs/media/settings) behind a
  `KiokuRepository` **interface** (Dexie impl), so a sync backend can replace it
  without touching the UI. Reactive reads via `dexie-react-hooks`.
- **Scheduling** — `Scheduler` interface with SM-2 (implemented verbatim from the
  spec) and FSRS (ts-fsrs 5.4 / FSRS-6) adapters, selectable per deck. The review
  engine never branches on algorithm. Covered by unit tests.
- **Shell** — sidebar (desktop) / top bar (mobile), routing, Recentes, version.
- **Home** — greeting, "Continuar revisando" banner (most-due deck), 3 stat
  tiles, deck browser (filter pills + search + create).
- **Decks / Deck detail** — colored hero, counts, mastery bar, algorithm badge,
  card list (Frente/Verso), add/edit/delete cards, per-deck settings
  (algorithm, new/review caps, FSRS retention, King of Buttons, TTS language) +
  delete deck.
- **Card editor** — rich text (bold/italic/underline/list) + image insert; images
  stored as `MediaBlob` and referenced as `kioku-media://<id>` (no base64 in HTML),
  resolved to object URLs at render. Render path is sanitized.
- **Review mode** — full-screen, 3D flip card (white slab + offset shadow), live
  counters, **King of Buttons** (2/3/4 configurable) with per-button interval
  previews, keyboard (space/enter flip; 1..N rate; space=Bom; Esc exit), in-session
  learning recurrence, completion summary (accuracy + breakdown + duration).
  Four-state queue with per-deck daily caps. Verified by an integration test.
- **TTS** — Web Speech service behind a swappable `TtsService` interface; speaker
  icons on card faces (review) and in the card list; per-deck language; voice +
  rate + auto-pronounce-on-reveal settings.
- **Statistics** — 16-week GitHub-style heatmap, 14-day stacked performance bars,
  4 stat tiles, per-deck mastery bars, recent-sessions list.
- **Settings** — global study defaults, default algorithm (+ FSRS explanation),
  FSRS retention slider, King of Buttons default, TTS block, appearance note,
  data reset (with reseed).
- **Import** — Anki `.apkg` (jszip + sql.js): notes → a Kioku deck of new cards,
  `<img>` media re-imported as MediaBlobs. Import/export are code-split (jszip,
  sql.js and the 660 kB wasm load on demand; main bundle unaffected).
- **Export** — best-effort `.apkg` (standard Anki2 schema; validated by a node
  round-trip test).

## Tests (19, all green)

- SM-2 + FSRS scheduler behavior (`features/scheduling/scheduler.test.ts`).
- Queue building / caps / ordering (`features/review/queue.test.ts`).
- Stats compute (`features/stats/compute.test.ts`).
- Anki export schema round-trip via sql.js (`features/importer/anki-schema.test.ts`).
- **App smoke** — boots, seeds, renders the shell + a seeded deck (jsdom +
  fake-indexeddb). This caught a real first-run bug (see below).
- **Review smoke** — renders a session, flips, shows interval previews, rates,
  completes.

---

## Known issues / partial / stubbed

1. **Export is best-effort for Anki re-import.** The SQLite schema + note/card
   round-trip is unit-tested, but it has not been verified against a live Anki
   install. It is guaranteed to round-trip through Kioku's own importer.
2. **`anki21b` (new compressed) .apkg not supported** — needs a zstd decoder.
   The importer detects it and tells the user to re-export with "Support older
   Anki versions".
3. **Import maps all notes into one deck**, first field → front, remaining fields
   → back (joined with `<hr>`). Multi-deck and note-type-aware field mapping are
   deferred.
4. **FSRS `learning_steps` not persisted** — ts-fsrs 5's `Card` has a
   `learning_steps` field absent from Kioku's `FsrsFields` (the spec's verbatim
   adapter). FSRS multi-step *learning* progression resets each review. Low impact
   for review-state cards; noted for follow-up.
5. **Media GC** — deleting a deck doesn't garbage-collect its orphaned MediaBlobs.
6. **Object URLs** for media are cached and not revoked (bounded by media count).
7. **No e2e/browser-driver tests** — verification is unit + jsdom integration +
   dev-server transform check. Playwright was intentionally not added overnight.

A first-run crash was **found and fixed during verification**: `useSettings` ran
`repo.getSettings()` inside a Dexie liveQuery, but `getSettings` wrote default
settings on a missing row → `ReadOnlyError`. `getSettings` is now read-only.

---

## Prioritized refinements for the morning

1. **Verify a real Anki `.apkg` import** with media end-to-end in the browser, and
   confirm the **export** actually imports into Anki Desktop; fix schema gaps if any.
2. **Persist FSRS `learning_steps`** (extend `FsrsFields` + the adapter) for exact
   short-term FSRS learning fidelity.
3. **Multi-deck import** + note-type/template-aware field mapping; strip/keep
   `[sound:...]` and cloze syntax.
4. **Media GC** on deck/card delete; optionally revoke object URLs on unmount.
5. **`anki21b` support** (bundle a small zstd decoder) for modern .apkg files.
6. Polish: empty-state illustrations, deck reordering, keyboard hint overlay in
   review, per-deck "study ahead", and an in-app toast system (replace the few
   `alert()`s in export error paths).
7. Consider an FSRS parameter optimizer later (out of scope for v1).

---

## Notable decisions

See `DECISIONS.md` (build-in-root, Vite 8 / TS 6 / React-18-types resolution,
`Panel` vs `Card` naming, reactive-reads-through-repo tradeoff). Step-by-step
log in `PROGRESS.md`.
