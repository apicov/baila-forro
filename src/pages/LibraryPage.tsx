import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Card, CardActionArea, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment,
  IconButton, LinearProgress, ListItemIcon, Menu, MenuItem, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import QueueMusicIcon from '@mui/icons-material/QueueMusic';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import GroupsIcon from '@mui/icons-material/Groups';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { NowPlayingBar } from '@/components/NowPlayingBar';
import { SongItem } from '@/components/SongItem';
import { SharingDialog } from '@/components/SharingDialog';
import { AddToPlaylistDialog, NameDialog } from '@/components/PlaylistDialogs';
import { db, deleteSong, type PlaylistRow, type SongRow } from '@/library/db';
import { importSongs } from '@/library/importSongs';
import { canPickFolder, importFolder, type Opened, pickFolder } from '@/library/folder';
import { matches } from '@/library/search';
import { searchText } from '@/library/tags';
import { engine, useEngine } from '@/audio/useEngine';
import { player } from '@/audio/player';

type Message = { ok: boolean; text: string };

export function LibraryPage() {
  const e = useEngine();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'playlists' ? 'playlists' : 'songs'; // in the URL: back from a playlist lands here
  const [songs, setSongs] = useState<SongRow[] | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState<SongRow | null>(null);
  const [adding, setAdding] = useState<SongRow | null>(null);
  const [naming, setNaming] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [more, setMore] = useState<HTMLElement | null>(null);
  const [sharing, setSharing] = useState(false);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    void db.songs.orderBy('title').toArray().then(setSongs);
    void db.playlists.orderBy('name').toArray().then(setPlaylists);
  }, []);
  useEffect(refresh, [refresh]);

  const shownSongs = (songs ?? []).filter((s) => matches(searchText(s), query));
  const shownPlaylists = playlists.filter((p) => matches(p.name, query));

  const work = async (job: () => Promise<Message | null>) => {
    setBusy(true);
    setMessage(null);
    try { setMessage(await job()); }
    catch (err) { setMessage({ ok: false, text: `Failed: ${err instanceof Error ? err.message : String(err)}` }); }
    finally { setBusy(false); refresh(); }
  };

  const onFiles = (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (filesInput.current) filesInput.current.value = '';
    if (!files.length) return;
    void work(async () => {
      const picked = await importSongs(files);
      return picked.length
        ? { ok: true, text: `Imported ${picked.map((p) => `${p.title} (${Object.keys(p.stems).length} stems${p.beats ? ' + beats' : ''})`).join(', ')}` }
        : { ok: false, text: 'No song files in that selection: pick the <song>_<stem>.mp3 files and <song>_beats.json.' };
    });
  };

  const opened = (o: Opened | null): Message | null => {
    if (!o) return null;
    if (!o.songs) return { ok: false, text: `No songs in “${o.name}”: it needs <song>_<stem>.mp3 files, in it or in its subfolders.` };
    navigate(`/playlist/${o.playlistId}`);
    return null;
  };
  const openFolder = () => {
    setMenu(null);
    if (canPickFolder) void work(async () => opened(await pickFolder()));
    else folderInput.current?.click();
  };
  const onFolderFiles = (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (folderInput.current) folderInput.current.value = '';
    if (files.length) void work(async () => opened(await importFolder(files)) ?? { ok: false, text: 'No songs in that folder.' });
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    if (engine.songId === deleting.id) engine.unload();
    await deleteSong(deleting.id);
    setDeleting(null);
    refresh();
  };

  const play = (s: SongRow) => {
    player.play(s, shownSongs.map((x) => x.id), { label: 'Library', path: '/' });
    navigate(`/song/${encodeURIComponent(s.id)}`);
  };

  return (
    <AppShell title="Pico Forró" footer={e.songId ? <NowPlayingBar /> : undefined} actions={
      <>
        <Button startIcon={<AddIcon />} onClick={(ev) => setMenu(ev.currentTarget)} disabled={busy} aria-label="Add">Add</Button>
        <IconButton aria-label="More" onClick={(ev) => setMore(ev.currentTarget)}><MoreVertIcon /></IconButton>
      </>
    }>
      <Menu anchorEl={more} open={!!more} onClose={() => setMore(null)}>
        <MenuItem onClick={() => { setMore(null); setSharing(true); }}>
          <ListItemIcon><GroupsIcon fontSize="small" /></ListItemIcon>Sharing…
        </MenuItem>
      </Menu>
      <SharingDialog open={sharing} onClose={() => setSharing(false)} />
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { setMenu(null); filesInput.current?.click(); }}>
          <ListItemIcon><LibraryMusicIcon fontSize="small" /></ListItemIcon>Import files
        </MenuItem>
        <MenuItem onClick={openFolder}><ListItemIcon><FolderOpenIcon fontSize="small" /></ListItemIcon>Open folder as playlist</MenuItem>
        <MenuItem onClick={() => { setMenu(null); setNaming(true); }}>
          <ListItemIcon><QueueMusicIcon fontSize="small" /></ListItemIcon>New playlist
        </MenuItem>
      </Menu>
      {/* no `accept`: the Android picker would hide the .json files behind an audio filter */}
      <input ref={filesInput} type="file" multiple hidden onChange={(ev) => onFiles(ev.target.files)} />
      {/* the browser's folder picker (on Android, the app's own) */}
      <input ref={folderInput} type="file" hidden {...{ webkitdirectory: '' }} onChange={(ev) => onFolderFiles(ev.target.files)} />

      <TextField fullWidth size="small" placeholder={tab === 'songs' ? 'Search songs' : 'Search playlists'} value={query}
        onChange={(ev) => setQuery(ev.target.value)} sx={{ mb: 1 }}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }} />
      <Tabs value={tab} onChange={(_, v) => setParams(v === 'songs' ? {} : { tab: v }, { replace: true })} sx={{ mb: 2 }}>
        <Tab value="songs" label={`Songs${songs ? ` (${songs.length})` : ''}`} />
        <Tab value="playlists" label={`Playlists (${playlists.length})`} />
      </Tabs>

      {busy && <LinearProgress sx={{ mb: 2 }} />}
      {message && <Alert severity={message.ok ? 'success' : 'warning'} sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}

      {tab === 'songs' && songs?.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 4 }}>
          No songs yet. Tap <b>Add</b>: <b>Open folder as playlist</b> plays the songs of a folder from where they are
          (a song folder, or a folder of song folders); <b>Import files</b> copies a song into the app: open a song
          folder and select its stems (<code>_vocals</code>, <code>_guitar</code>, <code>_piano</code>, <code>_bass</code>,
          <code> _drums</code>, <code>_other</code>.mp3) and <code>_beats.json</code>.
        </Typography>
      )}
      {tab === 'songs' && songs && songs.length > 0 && shownSongs.length === 0 && (
        <Typography color="text.secondary">No song matches “{query}”.</Typography>
      )}
      {tab === 'playlists' && shownPlaylists.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          {playlists.length ? `No playlist matches “${query}”.` : 'No playlists yet. Tap Add: New playlist, or Open folder as playlist.'}
        </Typography>
      )}

      <Stack spacing={1.5}>
        {tab === 'songs' && shownSongs.map((s) => (
          <SongItem key={s.id} song={s} onPlay={() => play(s)} onTagged={refresh} actions={[
            { label: 'Add to playlist…', onClick: () => setAdding(s) },
            { label: 'Delete', onClick: () => setDeleting(s) },
          ]} />
        ))}
        {tab === 'playlists' && shownPlaylists.map((p) => (
          <Card key={p.id}>
            <CardActionArea onClick={() => navigate(`/playlist/${p.id}`)}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{p.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {p.songIds.length} {p.songIds.length === 1 ? 'song' : 'songs'}{p.tree ? ' · folder' : ''}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>

      <Dialog open={!!deleting} onClose={() => setDeleting(null)}>
        <DialogTitle>Delete “{deleting?.title}” and its beat edits?</DialogTitle>
        {deleting?.files && <DialogContent>It leaves the app and its playlists; its files stay in their folder.</DialogContent>}
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button color="error" onClick={() => void confirmDelete()}>Delete</Button>
        </DialogActions>
      </Dialog>
      <AddToPlaylistDialog song={adding} onClose={(name) => {
        setAdding(null);
        if (name) { setMessage({ ok: true, text: `Added to “${name}”.` }); refresh(); }
      }} />
      <NameDialog open={naming} title="New playlist" onClose={() => setNaming(false)} onSave={(name) => {
        setNaming(false);
        void db.playlists.add({ name, songIds: [] }).then((id) => navigate(`/playlist/${id}`));
      }} />
    </AppShell>
  );
}
