import { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import { isSetUp, loadSharing, saveSharing, syncNow, useSyncStatus } from '@/library/sync';

/** Sharing the songs' tags with a group: the server, your name and the group's code. Saving checks them. */
export function SharingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const status = useSyncStatus();
  const [form, setForm] = useState(loadSharing);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (open) { setForm(loadSharing()); setResult(null); } }, [open]);
  const field = (k: 'server' | 'name' | 'code') => ({
    value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }),
  });

  const save = async () => {
    saveSharing(form);
    setResult(null);
    if (!isSetUp(form)) { setResult({ ok: true, text: 'Saved. Sharing is off until the name and the code are filled in.' }); return; }
    try {
      const n = await syncNow();
      setResult({ ok: true, text: `Connected. ${n ? `Shared the tags of ${n} ${n === 1 ? 'song' : 'songs'}.` : 'Your tags are all shared.'}` });
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Sharing</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Your tags (rhythm, looks right / needs a fix, notes) go to your group's server, with your name. No songs or
          audio are sent.
        </DialogContentText>
        <Stack spacing={2}>
          <TextField label="Your name" size="small" {...field('name')} />
          <TextField label="Group code" size="small" autoComplete="off" {...field('code')} />
          <TextField label="Server" size="small" {...field('server')} />
        </Stack>
        {result && <Alert severity={result.ok ? 'success' : 'error'} sx={{ mt: 2 }}>{result.text}</Alert>}
        {!result && status.error && <Alert severity="warning" sx={{ mt: 2 }}>Last try: {status.error}</Alert>}
        {status.last && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Last shared {new Date(status.last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" disabled={status.busy} onClick={() => void save()}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}
