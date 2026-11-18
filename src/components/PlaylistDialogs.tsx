import { useEffect, useState } from 'react';
import {
  Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItemButton, ListItemIcon,
  ListItemText, TextField,
} from '@mui/material';
import { db, type PlaylistRow, type SongRow } from '@/library/db';
import { matches } from '@/library/search';
import { searchText } from '@/library/tags';

/** A name for a new playlist, or a new name for one. */
export function NameDialog({ open, title, initial = '', onClose, onSave }: {
  open: boolean; title: string; initial?: string; onClose: () => void; onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  useEffect(() => { if (open) setName(initial); }, [open, initial]);
  const save = () => { if (name.trim()) onSave(name.trim()); };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth label="Name" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }} sx={{ mt: 1 }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={!name.trim()}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Adds one song to a playlist (or to a new one). */
export function AddToPlaylistDialog({ song, onClose }: { song: SongRow | null; onClose: (added?: string) => void }) {
  const [lists, setLists] = useState<PlaylistRow[]>([]);
  const [naming, setNaming] = useState(false);
  useEffect(() => { if (song) void db.playlists.orderBy('name').toArray().then(setLists); }, [song]);
  const add = async (p: PlaylistRow) => {
    if (!song) return;
    if (!p.songIds.includes(song.id)) await db.playlists.update(p.id!, { songIds: [...p.songIds, song.id] });
    onClose(p.name);
  };
  return (
    <>
      <Dialog open={!!song && !naming} onClose={() => onClose()} fullWidth maxWidth="xs">
        <DialogTitle>Add “{song?.title}” to</DialogTitle>
        <List>
          {lists.map((p) => (
            <ListItemButton key={p.id} onClick={() => void add(p)} disabled={!!song && p.songIds.includes(song.id)}>
              <ListItemText primary={p.name} secondary={song && p.songIds.includes(song.id) ? 'already in it' : `${p.songIds.length} songs`} />
            </ListItemButton>
          ))}
          <ListItemButton onClick={() => setNaming(true)}><ListItemText primary="New playlist…" /></ListItemButton>
        </List>
        <DialogActions><Button onClick={() => onClose()}>Cancel</Button></DialogActions>
      </Dialog>
      <NameDialog open={naming} title="New playlist" onClose={() => setNaming(false)} onSave={(name) => {
        setNaming(false);
        void db.playlists.add({ name, songIds: [] }).then(async (id) => add((await db.playlists.get(id))!));
      }} />
    </>
  );
}

/** Picks songs of the library to add to a playlist (the ones in it already are left out). */
export function AddSongsDialog({ open, playlist, onClose }: { open: boolean; playlist: PlaylistRow; onClose: (ids: string[]) => void }) {
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!open) return;
    setPicked([]); setQuery('');
    void db.songs.orderBy('title').toArray().then((all) => setSongs(all.filter((s) => !playlist.songIds.includes(s.id))));
  }, [open, playlist]);
  const shown = songs.filter((s) => matches(searchText(s), query));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Dialog open={open} onClose={() => onClose([])} fullWidth maxWidth="sm">
      <DialogTitle>Add songs to “{playlist.name}”</DialogTitle>
      <DialogContent dividers sx={{ px: 1 }}>
        <TextField fullWidth size="small" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} sx={{ px: 1, mb: 1 }} />
        {songs.length === 0 && <ListItemText sx={{ px: 2 }} secondary="Every song of the library is in this playlist already." />}
        <List dense>
          {shown.map((s) => (
            <ListItemButton key={s.id} onClick={() => toggle(s.id)}>
              <ListItemIcon><Checkbox edge="start" checked={picked.includes(s.id)} tabIndex={-1} disableRipple /></ListItemIcon>
              <ListItemText primary={s.title} />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose([])}>Cancel</Button>
        <Button onClick={() => onClose(picked)} disabled={!picked.length}>Add {picked.length || ''}</Button>
      </DialogActions>
    </Dialog>
  );
}
