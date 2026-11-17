import type { ReactNode } from 'react';
import { AppBar, Box, IconButton, Toolbar, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link as RouterLink } from 'react-router-dom';
import { HEADING_FONT } from '@/theme/theme';

/** The bar at the top of every page (Pico Reader's, with a back arrow off the library) and the page under it.
 *  `footer` stays at the bottom of the screen (the player's transport). */
export function AppShell({ title, back, actions, footer, children }: {
  title: string; back?: string; /* where the back arrow goes */ actions?: ReactNode; footer?: ReactNode; children: ReactNode;
}) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" sx={{ pt: 'env(safe-area-inset-top)' }}>
        <Toolbar sx={{ px: { xs: 1.5, sm: 3 }, gap: 1 }}>
          {back && (
            <IconButton component={RouterLink} to={back} aria-label="Back" edge="start">
              <ArrowBackIcon />
            </IconButton>
          )}
          <Typography variant="h6" noWrap sx={{ flexGrow: 1, fontFamily: HEADING_FONT }}>{title}</Typography>
          {actions}
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ flexGrow: 1, px: { xs: 2, sm: 3 }, py: 2, width: '100%', maxWidth: 900, mx: 'auto' }}>
        {children}
      </Box>
      {footer && (
        <Box sx={{ position: 'sticky', bottom: 0, bgcolor: 'background.default', borderTop: 1, borderColor: 'divider',
          pb: 'env(safe-area-inset-bottom)' }}>
          <Box sx={{ maxWidth: 900, mx: 'auto', px: { xs: 2, sm: 3 } }}>{footer}</Box>
        </Box>
      )}
    </Box>
  );
}
