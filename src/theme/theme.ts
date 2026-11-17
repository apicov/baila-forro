/** Pico Reader's paper and dark palettes (pico-reader/frontend/src/theme/readingThemes.ts), following the
 *  phone's light/dark setting, plus the colours of the step roles. */
import { createTheme, type Theme } from '@mui/material';
import type { Role } from '@/beats/model';

export type ThemeName = 'paper' | 'dark';

export const THEMES = {
  paper: { mode: 'light', background: '#faf8f3', surface: '#ffffff', text: '#2b2b2b', muted: '#6f6a61',
    accent: '#3d5a80', divider: '#e6e1d6', tap: 'rgba(43, 43, 43, 0.12)' },
  dark: { mode: 'dark', background: '#1e1e1e', surface: '#262626', text: '#d6d3cd', muted: '#9a968e',
    accent: '#8fb3d9', divider: '#363431', tap: 'rgba(214, 211, 205, 0.14)' },
} as const;

/** One and two in the accent's family, three (the accent click) warm, the pause grey. */
export const ROLE_COLORS: Record<ThemeName, Record<Role, string>> = {
  paper: { 1: '#3d5a80', 2: '#3f7a3a', 3: '#c0582b', 0: '#a39e94' },
  dark: { 1: '#8fb3d9', 2: '#9ccc8a', 3: '#e8915f', 0: '#6a665f' },
};

export const HEADING_FONT = '"Literata", "Noto Serif", Georgia, serif';
export const UI_FONT = '"Inter", "Noto Sans", system-ui, sans-serif';

export function createAppTheme(name: ThemeName): Theme {
  const c = THEMES[name];
  return createTheme({
    palette: {
      mode: c.mode,
      primary: { main: c.accent },
      background: { default: c.background, paper: c.surface },
      text: { primary: c.text, secondary: c.muted },
      divider: c.divider,
    },
    typography: {
      fontFamily: UI_FONT,
      h5: { fontFamily: HEADING_FONT }, h6: { fontFamily: HEADING_FONT },
      button: { textTransform: 'none', fontWeight: 500 },
    },
    shape: { borderRadius: 8 },
    components: {
      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'inherit' },
        styleOverrides: { root: { backgroundColor: c.background, borderBottom: `1px solid ${c.divider}` } },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiCssBaseline: { styleOverrides: { html: { WebkitTapHighlightColor: c.tap } } },
      MuiCard: { defaultProps: { variant: 'outlined' } },
    },
  });
}
