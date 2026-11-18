import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, Menu, MenuItem,
  Stack, Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { NowPlayingBar } from '@/components/NowPlayingBar';
import { SongItem } from '@/components/SongItem';
import { AddSongsDialog, NameDialog } from '@/components/PlaylistDialogs';
import { db, type PlaylistRow, type SongRow } from '@/library/db';
import { canPickFolder, rescanFolder } from '@/library/folder';
import { useEngine } from '@/audio/useEngine';
import { player } from '@/audio/player';

export function PlaylistPage() {
  const id = Number(useParams().id);
  const e = useEngine();
  const navigate = useNavigate();
  const [list, setList] = useState<PlaylistRow | null | undefined>(undefined);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const p = await db.playlists.get(id);
    setList(p ?? null);
    if (!p) return;
    const rows = await db.songs.bulkGet(p.songIds);
    setSongs(rows.filter((r): r is SongRow => !!r));
  }, [id]);
  useEffect(() => { void refresh(); }, [refresh]);

  if (list === undefined) return <AppShell title="" back="/?tab=playlists"><LinearProgress /></AppShell>;
  if (list === null) return <AppShell title="Not found" back="/?tab=playlists"><Alert severity="warning">This playlist is gone.</Alert></AppShell>;

  const path = `/playlist/${id}`;
  const play = (s: SongRow) => {
    player.play(s, songs.map((x) => x.id), { label: list.name, path });
    navigate(`/song/${encodeURIComponent(s.id)}`);
  };
  const setOrder = async (songIds: string[]) => { await db.playlists.update(id, { songIds }); await refresh(); };
  const move = (i: number, by: -1 | 1) => {
    const ids = songs.map((s) => s.id);
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    void setOrder(ids);
  };
  const rescan = async () => {
    setMenu(null);
    setBusy(true);
    setError(null);
    try { await rescanFolder(list.tree!); await refresh(); }
    catch (err) { setError(`Can't read the folder (moved or renamed?): ${err instanceof Error ? err.message : String(err)}`); }
    finally { setBusy(false); }
  };

  return (
    <AppShell title={list.name} back="/?tab=playlists" footer={e.songId ? <NowPlayingBar /> : undefined} actions={
      <IconButton aria-label="Playlist options" onClick={(ev) => setMenu(ev.currentTarget)}><MoreVertIcon /></IconButton>
    }>
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { setMenu(null); setRenaming(true); }}>Rename</MenuItem>
        {list.tree && canPickFolder && <MenuItem onClick={() => void rescan()}>Re-scan folder</MenuItem>}
        <MenuItem onClick={() => { setMenu(null); setDeleting(true); }}>Delete playlist</MenuItem>
      </Menu>

      <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: 'center' }}>
        <Button variant="contained" startIcon={<PlayArrowIcon />} disabled={!songs.length} onClick={() => play(songs[0])}>Play all</Button>
        <Button startIcon={<PlaylistAddIcon />} onClick={() => setAdding(true)}>Add songs</Button>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
          {songs.length} {songs.length === 1 ? 'song' : 'songs'}{list.tree ? ' · folder' : ''}
        </Typography>
      </Stack>
      {busy && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {!songs.length && <Typography color="text.secondary">No songs in this playlist yet: tap <b>Add songs</b>.</Typography>}

      <Stack spacing={1.5}>
        {songs.map((s, i) => (
          <SongItem key={s.id} song={s} onPlay={() => play(s)} onTagged={() => void refresh()} actions={[
            { label: 'Move up', onClick: () => move(i, -1), disabled: i === 0 },
            { label: 'Move down', onClick: () => move(i, 1), disabled: i === songs.length - 1 },
            { label: 'Remove from playlist', onClick: () => void setOrder(songs.filter((x) => x.id !== s.id).map((x) => x.id)) },
          ]} />
        ))}
      </Stack>

      <AddSongsDialog open={adding} playlist={list} onClose={(ids) => {
        setAdding(false);
        if (ids.length) void setOrder([...list.songIds, ...ids]);
      }} />
      <NameDialog open={renaming} title="Rename playlist" initial={list.name} onClose={() => setRenaming(false)}
        onSave={(name) => { setRenaming(false); void db.playlists.update(id, { name }).then(refresh); }} />
      <Dialog open={deleting} onClose={() => setDeleting(false)}>
        <DialogTitle>Delete the playlist “{list.name}”?</DialogTitle>
        <DialogContent>Its songs stay in the library.</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(false)}>Cancel</Button>
          <Button color="error" onClick={() => void db.playlists.delete(id).then(() => navigate('/?tab=playlists', { replace: true }))}>Delete</Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
