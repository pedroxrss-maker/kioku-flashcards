# Kioku 記憶

A web-only spaced-repetition flashcard app — dramatically better than Anki in
design and UX, with the scheduling efficiency of modern SRS. Dark-first,
brutalist, editorial. UI in Brazilian Portuguese; code in English.

> **v1, web only.** No backend, no accounts, no cloud sync. All data is local
> (IndexedDB). The persistence layer sits behind an interface so a sync backend
> can be added later without rewriting the UI.

## Features

- **Two schedulers, selectable per deck** — SM-2 (Anki-flavored) and **FSRS-6**
  (via `ts-fsrs`), behind one `Scheduler` interface.
- **King of Buttons** — 2, 3, or 4 answer buttons per deck, each previewing its
  next interval.
- **Beautiful review mode** — full-screen flip card, keyboard-driven, live counters.
- **Rich card editor** — bold/italic/underline/lists + images (stored as blobs,
  referenced by `kioku-media://` URIs, never base64 in the HTML).
- **Native TTS** — Web Speech pronunciation, per-deck language, swappable for a
  cloud provider later.
- **Statistics** — GitHub-style review heatmap, daily performance bars, per-deck
  progress, recent sessions.
- **Anki `.apkg` import** (and best-effort export).

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest
npm run build    # production build
```

Requires Node ≥ 20.

## Stack

Vite 8 · React 18 · TypeScript (strict) · Tailwind CSS v4 · Dexie · ts-fsrs ·
react-router · lucide-react · jszip + sql.js (import/export).

## Project layout

```
src/
  app/          router, shell, sidebar
  pages/        Home, Decks, DeckDetail, ReviewHub, ReviewSession, Stats, Settings
  features/
    scheduling/ Scheduler interface + sm2 + fsrs adapters (+ tests)
    decks/      deck/card CRUD, rich-text editor
    review/     queue + session engine + answer buttons (+ tests)
    media/      kioku-media:// resolution + render
    tts/        text-to-speech service + controls
    stats/      heatmap, charts, compute (+ tests)
    importer/   .apkg import/export
  components/    shared primitives (Button, Pill, Panel, Modal, …)
  db/           Dexie schema + repository interface + seed
  lib/          utils, date/text/format helpers
  styles/       globals.css (design tokens + brand classes)
```

See `MORNING.md` for current status, known issues, and next steps;
`DECISIONS.md` for design decisions; `PROGRESS.md` for the build log.
