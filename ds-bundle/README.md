# Kioku Design System — usage

Dark-first study-app UI: soft rounded surfaces, hairline borders, a hot red-orange
accent, Fraunces (display) + Manrope (body). Components are imported from
`window.KiokuDS.*` (the root `_ds_bundle.js`); load `styles.css` once — it carries
the tokens, fonts, and component classes.

## Setup — no provider, but theme the root
Components need **no** provider/context wrapper. They DO rely on the design tokens
in `:root` (shipped in `styles.css`) and are built for a **dark** canvas, so wrap
your app shell or text reads black-on-dark wrong:

```jsx
const { Panel, Button, Pill } = window.KiokuDS;

<div style={{ background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'var(--body)', minHeight: '100vh', padding: 24 }}>
  <Panel className="p-5" style={{ maxWidth: 360 }}>
    <p className="display" style={{ fontSize: 18 }}>Inglês — Vocabulário</p>
    <p className="text-muted text-sm mt-1">128 cards · 12 para revisar</p>
    <div className="flex gap-2 mt-3">
      <Pill active>Revisão</Pill>
      <Button variant="accent" size="sm">Estudar</Button>
    </div>
  </Panel>
</div>
```

## Styling idiom — tokens + Tailwind v4 + named component classes
Three layers, used together. Prefer tokens/utilities; reach for the named classes
when you want a component's exact DS look.

**Design tokens** (`var(--*)`, defined in `:root`):
- Color: `--bg` `--surface` `--surface-2` `--fg` `--muted` `--line` `--line-strong` `--accent` (#ff3b1f) `--accent-blue` `--accent-green` `--accent-amber` `--accent-soft`
- Type: `--display` (Fraunces) · `--body` (Manrope) · `--mono` (DM Mono)
- Radius: `--r-sm` 10 · `--r-md` 14 · `--r-lg` 20 · `--r-full` 999 — Shadow: `--shadow-card` `--shadow-pop`

**Tailwind v4 utilities** (an `@theme` block maps the tokens into utilities):
`bg-surface` `bg-surface-2` `bg-accent` `text-fg` `text-muted` `text-accent`
`border-line` `rounded-lg` (14px) `rounded-xl` (20px), plus the full standard set
(`flex gap-2 p-5 items-center …`).

**Named component classes** (in `styles.css` — these reproduce the DS look exactly):
- Surfaces: `.surface` (the Panel card) · `.hover-lift` · `.icon-tile`
- Buttons: `.btn` `.btn-mega` `.btn-accent` `.btn-ghost` `.btn-sm`
- Inputs: `.field` `.field-round` `.field-label`
- Tags: `.pill` `.pill-active` `.pill-muted`
- Modal: `.modal-overlay` `.modal-box` `.modal-close`
- Type: `.display` (Fraunces headings) · `.mono` (DM Mono) · `.text-muted`

## Where the truth lives
Read `styles.css` (and its `@import "./_ds_bundle.css"`) for the real rules before
inventing styles. Per component: `<Name>.d.ts` (props) and `<Name>.prompt.md`
(usage + examples). The 11 components — Button, Panel, Pill, PageHeader, Toggle,
Select, SmoothSlider, NumberRoller, Modal, StatTile, ConfirmDialog — are all on
`window.KiokuDS`.

# KiokuDS (kioku@1.0.0)

This design system is the published kioku React library, bundled as a single
browser global. All 11 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.KiokuDS`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.KiokuDS.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { Button } = window.KiokuDS;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<Button />);
```

## Tokens

116 CSS custom properties from kioku. Names are
preserved verbatim from upstream. They are declared inside `_ds_bundle.css` (this DS ships one compiled stylesheet rather than separate token files).

- **color** (26): `--tw-border-style`, `--tw-shadow-color`, `--tw-inset-shadow-color`, …
- **spacing** (5): `--tw-space-y-reverse`, `--tw-inset-shadow`, `--tw-inset-shadow-alpha`, …
- **typography** (8): `--tw-font-weight`, `--font-sans`, `--font-mono`, …
- **radius** (1): `--radius-sm`
- **shadow** (9): `--tw-shadow`, `--tw-shadow-alpha`, `--tw-ring-shadow`, …
- **other** (67): `--tw-translate-x`, `--tw-translate-y`, `--tw-translate-z`, …

## Components

### general
- `Button`
- `ConfirmDialog`
- `Modal`
- `NumberRoller`
- `PageHeader`
- `Panel`
- `Pill`
- `Select`
- `SmoothSlider`
- `StatTile`
- `Toggle`
