import { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import { loadSharing, logout, saveSharing, syncNow, useSharing, useSyncStatus } from '@/library/sync';

/** Your name in the group (changing it renames your tags for everyone), how sharing goes, and logging out. */
export function AccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const account = useSharing();
  const status = useSyncStatus();
  const [name, setName] = useState(account.name);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  useEffect(() => { if (open) { setName(loadSharing().name); setResult(null); setConfirmOut(false); } }, [open]);

  const saveName = async () => {
    saveSharing({ ...loadSharing(), name: name.trim() });
    try { await syncNow(); setResult({ ok: true, text: 'Saved.' }); }
    catch (err) { setResult({ ok: false, text: err instanceof Error ? err.message : String(err) }); }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Account</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Your tags (rhythm, looks right / needs a fix, notes) are shared with the group under this name. No songs or
          audio are sent.
        </DialogContentText>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TextField label="Your name" size="small" fullWidth value={name} onChange={(e) => setName(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 60 } }} />
          <Button disabled={!name.trim() || name.trim() === account.name || status.busy} onClick={() => void saveName()}>Save</Button>
        </Stack>
        {result && <Alert severity={result.ok ? 'success' : 'error'} sx={{ mt: 2 }}>{result.text}</Alert>}
        {!result && status.error && <Alert severity="warning" sx={{ mt: 2 }}>Last try: {status.error}</Alert>}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {account.server}
          {status.last && ` · last shared ${new Date(status.last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
        </Typography>
        {confirmOut && (
          <Alert severity="info" sx={{ mt: 2 }} action={<Button color="inherit" size="small" onClick={() => { onClose(); logout(); }}>Log out</Button>}>
            You'll need the group's code to come back in. Your songs and tags stay on this phone.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button color="error" onClick={() => setConfirmOut(true)} sx={{ mr: 'auto' }}>Log out…</Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
