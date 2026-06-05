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
