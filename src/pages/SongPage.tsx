import { useEffect, useState } from 'react';
import { Alert, Box, LinearProgress, Tab, Tabs, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Mixer } from '@/components/Mixer';
import { Transport } from '@/components/Transport';
import { BeatEditor } from '@/components/BeatEditor';
import { useEngine } from '@/audio/useEngine';
import { db, loadStems, STEMS, type SongRow } from '@/library/db';
import { songBeats, useBeatEdits } from '@/beats/useBeatEdits';

export function SongPage() {
  const id = decodeURIComponent(useParams().id ?? '');
  const [song, setSong] = useState<SongRow | null | undefined>(undefined);
  useEffect(() => { void db.songs.get(id).then((s) => setSong(s ?? null)); }, [id]);

  if (song === undefined) return <AppShell title="" back><LinearProgress /></AppShell>;
  if (song === null) return <AppShell title="Not found" back><Alert severity="warning">This song isn't in the library.</Alert></AppShell>;
  return <Song key={song.id} song={song} />;
}

function Song({ song }: { song: SongRow }) {
  const e = useEngine();
  const edits = useBeatEdits(song);
  const [tab, setTab] = useState<'mix' | 'beats'>('mix');
  const [error, setError] = useState<string | null>(null);

  // decode the stems, unless this song is the one already open (and maybe playing)
  useEffect(() => {
    if (e.songId === song.id) return; // loaded or loading already
    e.load(song.id, loadStems(song.id), songBeats(song))
      .catch((err: unknown) => setError(`Couldn't open the song: ${err instanceof Error ? err.message : String(err)}`));
  }, [e, song]);

  const loading = e.songId !== song.id || !!e.loading;
  // one figure for the whole song: the stems become usable together, when all are decoded
  const percent = e.songId === song.id && e.loading ? Math.round((100 * e.loading.done) / Math.max(1, e.loading.total)) : 0;
  return (
    <AppShell title={song.title} back footer={<Transport />}>
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
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab value="mix" label="Mix" />
            <Tab value="beats" label="Beats" disabled={!song.beatsOriginal && !song.beatsEdited} />
          </Tabs>
          {tab === 'mix' && <Mixer hasBeats={edits.beats.length > 0} />}
          {tab === 'beats' && <BeatEditor song={song} edits={edits} />}
        </>
      )}
    </AppShell>
  );
}
