# Kioku — Decisions log

Autonomous build decisions and their rationale. Append-only.

## Scaffolding

- **Build in the existing repo root (`d:/kioku flashcards`) instead of a `kioku/`
  subfolder.** The working directory is already the project and already a git
  repo with an initial commit. Nesting a `kioku/` folder would be awkward. The
  product is still named "kioku" (package name).
- **Hand-wrote the scaffold instead of running `npm create vite`.** The
  interactive scaffolder prompts when the directory is non-empty (it has
  `.git`/`.gitignore`), which would stall an unattended run.

## Versions (resolved by npm, newer than the spec's examples)

- **Vite 8 + `@vitejs/plugin-react` 6.** The spec wrote "Vite + React 18"; the
  current `@vitejs/plugin-react` peer-requires Vite 8, so pinning Vite 6 failed
  `ERESOLVE`. Vite 8 works fine on Node 24.
- **React 18.3 runtime, with `@types/react@18` pinned.** npm initially pulled
  `@types/react@19` (mismatched with the React 18 runtime); pinned the types to
  v18 to match. Honors the spec's "React 18".
- **TypeScript 6.** Resolved as latest; strict mode on as required.
- **ts-fsrs 5.4 (FSRS-6).** Latest; matches the spec's FSRS-6 requirement and
  the documented `fsrs()` / `repeat()` / `next()` API.
- **Tailwind CSS v4** via `@tailwindcss/postcss` (as the spec's dep list
  implies). Tokens are declared with `@theme`; brand component classes live in
  `styles/globals.css` as plain CSS (mirroring the real NeuroFluency site).

## Naming

- **UI surface primitive is `Panel`, not `Card`.** The spec lists "Card" as a
  shared primitive, but `Card` is also the core domain entity. Renamed the UI
  primitive to `Panel` to avoid a constant naming collision.

## Design

- Palette, typography and component signatures translated directly from the
  real NeuroFluency `index.html` brand styles (verified against the source):
  `.btn-mega`, `.pill`, `.nav-link`, `.hover-lift`, offset solid shadows, hard
  edges everywhere except pills, `::selection` accent.
