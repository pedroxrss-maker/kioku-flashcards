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
import type { ReactNode } from 'react';
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

/** Sun/moon switch. Shows the icon of the theme it switches TO (sun while dark,
 *  moon while light). `className` is appended to the shared `.theme-toggle` style.
 *
 *  Toggling just flips `data-theme`; the page cross-fades because the themed roots
 *  carry a CSS `transition` on their color properties (see `.theme-fade` /
 *  `[data-theme]` rules in globals.css). Under prefers-reduced-motion that
 *  transition is zeroed, so the flip is instant. There is no JS animation here. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      className={className ? `theme-toggle ${className}` : 'theme-toggle'}
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
