import { useEffect, useMemo } from 'react';
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { createAppTheme, THEMES } from './theme/theme';
import { LibraryPage } from './pages/LibraryPage';
import { SongPage } from './pages/SongPage';
import { PlaylistPage } from './pages/PlaylistPage';
import { LoginPage } from './pages/LoginPage';
import { useSharing } from './library/sync';

export default function App() {
  const name = useMediaQuery('(prefers-color-scheme: dark)') ? 'dark' : 'paper';
  const theme = useMemo(() => createAppTheme(name), [name]);
  const member = useSharing().member; // the app opens with a name and the group's code
  // the Android status bar takes this colour
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[name].background);
  }, [name]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {!member ? <LoginPage /> : (
      /* hash routes: work from the Android app's file origin with no server rewrites */
      <HashRouter>
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/song/:id" element={<SongPage />} />
          <Route path="/playlist/:id" element={<PlaylistPage />} />
        </Routes>
      </HashRouter>
      )}
    </ThemeProvider>
  );
}
