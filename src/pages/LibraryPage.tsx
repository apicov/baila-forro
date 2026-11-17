import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Card, CardActionArea, CardContent, Dialog, DialogActions, DialogTitle, IconButton, LinearProgress,
  Stack, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { Link as RouterLink } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { db, deleteSong, STEMS, type SongRow } from '@/library/db';
import { importSongs } from '@/library/importSongs';
import { engine } from '@/audio/useEngine';

export function LibraryPage() {
  const [songs, setSongs] = useState<SongRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleting, setDeleting] = useState<SongRow | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => { void db.songs.orderBy('title').toArray().then(setSongs); }, []);
  useEffect(refresh, [refresh]);

  const onPick = async (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (input.current) input.current.value = '';
    if (!files.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const picked = await importSongs(files);
      setMessage(picked.length
        ? { ok: true, text: `Imported ${picked.map((p) => `${p.title} (${Object.keys(p.stems).length} stems${p.beats ? ' + beats' : ''})`).join(', ')}` }
        : { ok: false, text: 'No song files in that selection: pick the <song>_<stem>.mp3 files and <song>_beats.json.' });
    } catch (e) {
      setMessage({ ok: false, text: `Import failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    if (engine.songId === deleting.id) engine.unload();
    await deleteSong(deleting.id);
    setDeleting(null);
    refresh();
  };

  return (
    <AppShell title="Pico Forró" actions={
      <Button startIcon={<AddIcon />} onClick={() => input.current?.click()} disabled={busy}>Import</Button>
    }>
      {/* no `accept`: the Android picker would hide the .json files behind an audio filter */}
      <input ref={input} type="file" multiple hidden onChange={(e) => void onPick(e.target.files)} />
      {busy && <LinearProgress sx={{ mb: 2 }} />}
      {message && <Alert severity={message.ok ? 'success' : 'warning'} sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}

      {songs?.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 4 }}>
          No songs yet. Tap <b>Import</b>, open a song folder and select all its files: the stems
          (<code>_vocals</code>, <code>_guitar</code>, <code>_piano</code>, <code>_bass</code>, <code>_drums</code>,
          <code> _other</code>.mp3) and <code>_beats.json</code>. The full mix and <code>_clicks.mp3</code> aren't needed.
        </Typography>
      )}

      <Stack spacing={1.5}>
        {songs?.map((s) => (
          <Card key={s.id} sx={{ display: 'flex', alignItems: 'center' }}>
            <CardActionArea component={RouterLink} to={`/song/${encodeURIComponent(s.id)}`}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{s.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {s.stems.length}/{STEMS.length} stems
                  {s.beatsOriginal ? ` · ${s.beatsOriginal.bpm ?? '?'} bpm` : ' · no beats file'}
                  {s.beatsEdited ? ' · beats edited' : ''}
                </Typography>
              </CardContent>
            </CardActionArea>
            <IconButton aria-label={`Delete ${s.title}`} onClick={() => setDeleting(s)} sx={{ mx: 1 }}>
              <DeleteOutlineIcon />
            </IconButton>
          </Card>
        ))}
      </Stack>

      <Dialog open={!!deleting} onClose={() => setDeleting(null)}>
        <DialogTitle>Delete “{deleting?.title}” and its beat edits?</DialogTitle>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button color="error" onClick={() => void confirmDelete()}>Delete</Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
