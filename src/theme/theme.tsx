/**
 * Shared theme switch (dark <-> light) for the whole product. Both the marketing
 * landing and the app use this SAME context + the SAME `data-theme` / CSS-variable
 * mechanism; they only differ in the palette values scoped to their root
 * (`.landing-root[data-theme='light']` vs `.app-shell[data-theme='light']`).
 *
 * The choice lives in React state for the session only — no localStorage (blocked
 * in the artifact/preview environment) and no DB round-trip. Default is dark.
 *
 * Mount a <ThemeProvider> around any surface that needs theming (the landing wraps
 * itself; the app wraps its authed shell) and read it via useTheme(). New screens
 * adopt the theme purely by living under a `[data-theme]` root and using the
 * shared CSS variables — no per-screen wiring.
 */
import { createContext, useContext, useMemo, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Moon, Sun } from 'lucide-react';

export type Theme = 'dark' | 'light';

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used within a ThemeProvider');
  return v;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');
  const value = useMemo<ThemeCtx>(
    () => ({
      theme,
      setTheme,
      toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    }),
    [theme],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Swap a `/foo.png` illustration for its `/foo-light.png` variant in light mode.
 *  Only use for images that actually ship a `-light` file. */
export function themedImage(src: string, theme: Theme): string {
  return theme === 'light' ? src.replace(/\.png$/, '-light.png') : src;
}

type DocWithVT = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void> };
};

/** Sun/moon switch. Shows the icon of the theme it switches TO (sun while dark,
 *  moon while light). `className` is appended to the shared `.theme-toggle` style.
 *
 *  On the landing page (where the toggle lives inside `.landing-root`) the theme
 *  swap plays a slow circular "wave" that reveals the new colors out from the
 *  button, via the View Transitions API. Elsewhere (and where the API is missing)
 *  it flips instantly. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  function handleToggle(e: MouseEvent<HTMLButtonElement>) {
    const btn = e.currentTarget;
    const doc = document as DocWithVT;
    const onLanding = !!btn.closest('.landing-root');
    if (!onLanding || typeof doc.startViewTransition !== 'function') {
      toggle();
      return;
    }
    // Origin = the button's center; the reveal radius reaches the farthest corner.
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    // The theme change MUST happen inside the update callback (and synchronously,
    // via flushSync) — mutating the DOM outside it makes the browser skip the
    // transition, which is what dropped the wave entirely.
    const vt = doc.startViewTransition(() => {
      flushSync(() => toggle());
    });
    vt.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 550,
            // Linear (constant radius growth) so the wave sweeps at an even pace
            // and never "sticks". The old easeOutExpo curve front-loaded ~90% of
            // the travel into the first frames, then crawled the far corner in —
            // which read as stuck/janky.
            easing: 'linear',
            pseudoElement: '::view-transition-new(root)',
            fill: 'forwards',
          },
        );
      })
      .catch(() => {
        /* transition skipped/aborted — the theme already flipped */
      });
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={className ? `theme-toggle ${className}` : 'theme-toggle'}
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
