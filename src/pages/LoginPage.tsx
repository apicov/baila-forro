import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Link, Stack, TextField, Typography } from '@mui/material';
import { HEADING_FONT } from '@/theme/theme';
import { DEFAULT_SERVER, login, loginReason, useSharing } from '@/library/sync';

/** The first screen: the app is for a group of friends, so it opens with a name and the group's code (checked
 *  with the group's server, so the first time needs the internet; after that the app works offline). */
export function LoginPage() {
  const saved = useSharing();
  const [name, setName] = useState(saved.name);
  const [code, setCode] = useState('');
  const [server, setServer] = useState(saved.server);
  const [showServer, setShowServer] = useState(saved.server !== DEFAULT_SERVER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(loginReason);

  const enter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try { await login({ name, code, server }); } // the app opens
    catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setError(text.startsWith("Can't reach") ? `${text} The first time needs the internet.` : text);
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary', display: 'flex',
      alignItems: 'center', justifyContent: 'center', px: 2, pt: 'env(safe-area-inset-top)' }}>
      <Box component="form" onSubmit={(e) => void enter(e)} sx={{ width: '100%', maxWidth: 360 }}>
        <Typography variant="h4" sx={{ fontFamily: HEADING_FONT, mb: 1 }}>Pico Forró</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          For a group of forró friends: enter your name and the group's code.
        </Typography>
        <Stack spacing={2}>
          <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!saved.name}
            slotProps={{ htmlInput: { maxLength: 60, autoComplete: 'name' } }} />
          <TextField label="Group code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus={!!saved.name}
            slotProps={{ htmlInput: { autoComplete: 'off', autoCapitalize: 'none', spellCheck: false } }} />
          {showServer
            ? <TextField label="Server" size="small" value={server} onChange={(e) => setServer(e.target.value)} />
            : <Link component="button" type="button" variant="caption" color="text.secondary" sx={{ alignSelf: 'flex-start' }}
                onClick={() => setShowServer(true)}>Another server…</Link>}
          {error && <Alert severity="error">{error}</Alert>}
          <Button type="submit" variant="contained" size="large" disabled={!name.trim() || !code.trim() || busy}
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}>
            {busy ? 'Checking…' : 'Enter'}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
