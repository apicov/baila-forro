import { useEffect, useRef, useState } from 'react';
import { Alert, Box, FormControlLabel, LinearProgress, Stack, Switch, Tab, Tabs, Typography } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Mixer } from '@/components/Mixer';
import { Transport } from '@/components/Transport';
import { BeatEditor } from '@/components/BeatEditor';
import { SongTags } from '@/components/SongTags';
import { Timeline, type WaveView, WaveViewToggle } from '@/components/Timeline';
import { useEngine } from '@/audio/useEngine';
import { usePlayer } from '@/audio/player';
import { db, STEMS, type SongRow } from '@/library/db';
import { useBeatEdits } from '@/beats/useBeatEdits';

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
  const [tab, setTab] = useState<'mix' | 'beats'>('mix');
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
  return (
    <AppShell title={song.title} back={p.queue.includes(song.id) ? p.from.path : '/'} footer={<Transport />}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <SongTags song={song} />
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
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab value="mix" label="Mix" />
            <Tab value="beats" label="Beats" disabled={!song.beatsOriginal && !song.beatsEdited} />
          </Tabs>
          {tab === 'mix' && (
            <Stack spacing={1.5}>
              <Timeline beats={edits.beats} view={view} showSteps={showSteps && edits.beats.length > 0} editable={false}
                windowSec={mixWindow} onZoom={setMixWindow} />
              <Stack direction="row" sx={{ alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <WaveViewToggle view={view} onChange={setView} />
                <FormControlLabel label="Steps" disabled={edits.beats.length === 0}
                  control={<Switch checked={showSteps} onChange={(_, v) => setShowSteps(v)} />} />
              </Stack>
              <Mixer hasBeats={edits.beats.length > 0} />
            </Stack>
          )}
          {tab === 'beats' && <BeatEditor song={song} edits={edits} view={view} onView={setView} />}
        </>
      )}
    </AppShell>
  );
}
