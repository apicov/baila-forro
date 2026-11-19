import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Badge, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, LinearProgress,
  ListItemIcon, Menu, MenuItem, Stack, Switch, Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import HowToVoteIcon from '@mui/icons-material/HowToVote';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import EditIcon from '@mui/icons-material/Edit';
import TuneIcon from '@mui/icons-material/Tune';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Mixer } from '@/components/Mixer';
import { Transport } from '@/components/Transport';
import { BeatEditor } from '@/components/BeatEditor';
import { SongTags } from '@/components/SongTags';
import { Timeline, type WaveView, WaveViewToggle } from '@/components/Timeline';
import { useEngine } from '@/audio/useEngine';
import { usePlayer } from '@/audio/player';
import { db, type Review, type Rhythm, STEMS, type SongRow } from '@/library/db';
import { songKey } from '@/library/importSongs';
import { RHYTHM_LABEL, VERDICT_LABEL } from '@/library/tags';
import { useGroup } from '@/library/sync';
import { useBeatEdits } from '@/beats/useBeatEdits';

// the mix's plot: as tall as the screen leaves, between these (a taller one only stretches the waveforms; the
// page scrolls before it gets smaller)
const MIN_PLOT = 150;
const MAX_PLOT = { xs: 260, md: 320 };

export function SongPage() {
  const id = decodeURIComponent(useParams().id ?? '');
  const [song, setSong] = useState<SongRow | null | undefined>(undefined);
  useEffect(() => { void db.songs.get(id).then((s) => setSong(s ?? null)); }, [id]);

  if (song === undefined) return <AppShell title="" back="/"><LinearProgress /></AppShell>;
  if (song === null) return <AppShell title="Not found" back="/"><Alert severity="warning">This song isn't in the library.</Alert></AppShell>;
  return <Song key={song.id} song={song} />;
}

function Song({ song }: { song: SongRow }) {
  const e = useEngine();
  const edits = useBeatEdits(song);
  // the steps editor instead of the mix: in the URL, so the back arrow and Android's back button leave it
  const [params, setParams] = useSearchParams();
  const editing = params.get('edit') === '1' && !!(song.beatsOriginal || song.beatsEdited);
  // back from the editor: to the mix it was opened from (or, opened straight into it, just to the mix)
  const leaveEditor = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : setParams({}, { replace: true }));
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tags, setTags] = useState<{ rhythm: Rhythm | null; review: Review | null }>({ rhythm: song.rhythm ?? null, review: song.review ?? null });
  const onTags = useCallback((t: { rhythm: Rhythm | null; review: Review | null }) => setTags(t), []);
  const g = useGroup()[songKey(song.id)];
  // votes of the group you haven't seen (you see them once you give yours)
  const unseen = (!tags.rhythm && !!g?.rhythm_votes) || (!tags.review && !!g?.reviews);
  const [mixWindow, setMixWindow] = useState(6); // seconds on screen; a pinch zooms
  const [view, setView] = useState<WaveView>('stacked'); // shared by both tabs
  const [showSteps, setShowSteps] = useState(true);
  const p = usePlayer();
  const navigate = useNavigate();
  const error = p.error?.songId === song.id ? `Couldn't open the song: ${p.error.message}` : null;

  // opened from the list it is loading (and will play) already; otherwise (the app reopened here) it loads paused
  useEffect(() => { p.open(song, false); }, [p, song]);

  // the player went on to another song (auto-play, next, previous): follow it
  const was = useRef(e.songId);
  useEffect(() => {
    if (was.current === song.id && e.songId && e.songId !== song.id) navigate(`/song/${encodeURIComponent(e.songId)}`, { replace: true });
    was.current = e.songId;
  }, [e.songId, song.id, navigate]);

  const loading = e.songId !== song.id || !!e.loading;
  // one figure for the whole song: the stems become usable together, when all are decoded
  const percent = e.songId === song.id && e.loading ? Math.round((100 * e.loading.done) / Math.max(1, e.loading.total)) : 0;
  const verdict = tags.review?.verdict;
  const tagsLabel = `Rhythm and review: ${tags.rhythm ? RHYTHM_LABEL[tags.rhythm] : 'no rhythm'}, ${verdict ? VERDICT_LABEL[verdict] : 'not reviewed'}`;
  return (
    <AppShell title={song.title} footer={<Transport />} fill={!editing}
      {...(editing ? { onBack: leaveEditor } : { back: p.queue.includes(song.id) ? p.from.path : '/' })}
      actions={
        <>
          <IconButton aria-label={tagsLabel} title={tagsLabel} onClick={() => setTagsOpen(true)}
            sx={{ color: verdict === 'right' ? 'success.main' : verdict === 'fix' ? 'warning.main' : undefined }}>
            <Badge color="primary" variant="dot" invisible={!unseen}>
              {verdict === 'right' ? <CheckCircleIcon /> : verdict === 'fix' ? <ReportProblemIcon /> : <HowToVoteIcon />}
            </Badge>
          </IconButton>
          <IconButton aria-label="Song menu" edge="end" onClick={(ev) => setMenu(ev.currentTarget)}><MenuIcon /></IconButton>
        </>
      }>
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
        {editing ? (
          <MenuItem onClick={() => { setMenu(null); leaveEditor(); }}><ListItemIcon><TuneIcon fontSize="small" /></ListItemIcon>Back to the mix</MenuItem>
        ) : (
          <MenuItem disabled={!song.beatsOriginal && !song.beatsEdited} onClick={() => { setMenu(null); setParams({ edit: '1' }); }}>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>Edit steps
          </MenuItem>
        )}
        <MenuItem onClick={() => { setMenu(null); setTagsOpen(true); }}>
          <ListItemIcon><HowToVoteIcon fontSize="small" /></ListItemIcon>Rhythm & review…
        </MenuItem>
      </Menu>
      {/* kept mounted: the tags' state (and a note being typed) lives on while the dialog is closed */}
      <Dialog open={tagsOpen} onClose={() => setTagsOpen(false)} keepMounted fullWidth maxWidth="xs">
        <DialogTitle>Rhythm & review</DialogTitle>
        <DialogContent><SongTags song={song} onChange={onTags} /></DialogContent>
        <DialogActions><Button onClick={() => setTagsOpen(false)}>Done</Button></DialogActions>
      </Dialog>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && !error && (
        <Box sx={{ mt: 6, mx: 'auto', maxWidth: 360, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ mb: 1.5, fontVariantNumeric: 'tabular-nums' }}>Loading {percent}%</Typography>
          <LinearProgress variant="determinate" value={percent} />
        </Box>
      )}
      {!loading && song.stems.length < STEMS.length && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Missing stems: {STEMS.filter((s) => !song.stems.includes(s)).join(', ')}. Import their files to add them.
        </Alert>
      )}
      {!loading && (
        <>
          {!editing && (
            <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0 }}>
              {/* the plot takes the height the screen leaves, from MIN_PLOT to MAX_PLOT */}
              <Box sx={{ flex: 1, minHeight: MIN_PLOT, maxHeight: MAX_PLOT, position: 'relative' }}>
                <Box sx={{ position: 'absolute', inset: 0 }}>
                  <Timeline beats={edits.beats} view={view} showSteps={showSteps && edits.beats.length > 0} editable={false}
                    windowSec={mixWindow} onZoom={setMixWindow} fill />
                </Box>
              </Box>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <WaveViewToggle view={view} onChange={setView} />
                <FormControlLabel label="Steps" disabled={edits.beats.length === 0}
                  control={<Switch checked={showSteps} onChange={(_, v) => setShowSteps(v)} />} />
              </Stack>
              <Mixer hasBeats={edits.beats.length > 0} />
            </Stack>
          )}
          {editing && <BeatEditor song={song} edits={edits} view={view} onView={setView} />}
        </>
      )}
    </AppShell>
  );
}
