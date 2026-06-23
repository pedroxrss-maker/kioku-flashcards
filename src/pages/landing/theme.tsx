/**
 * Landing theme = the shared product theme. This module re-exports the canonical
 * theme system (src/theme/theme.tsx) under the landing's historical names so the
 * landing and the app share ONE implementation, context, and CSS-variable
 * convention. The landing's light palette is scoped in globals.css under
 * `.landing-root[data-theme='light']`.
 */
export {
  ThemeProvider as LandingThemeProvider,
  useTheme as useLandingTheme,
  ThemeToggle,
  themedImage,
} from '../../theme/theme';
export type { Theme as LandingTheme } from '../../theme/theme';
