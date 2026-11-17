import { useState } from 'react';
import { IconButton, Slider, Stack, Typography } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import Replay5Icon from '@mui/icons-material/Replay5';
import Forward5Icon from '@mui/icons-material/Forward5';
import { useEngine, usePlaybackTime } from '@/audio/useEngine';

const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function Transport() {
  const e = useEngine();
  const time = usePlaybackTime();
  const [dragging, setDragging] = useState<number | null>(null); // seek only on release
  const ready = e.duration > 0 && !e.loading;
  return (
    <Stack sx={{ py: 1 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Typography variant="caption" sx={{ minWidth: 34, fontVariantNumeric: 'tabular-nums' }}>{clock(dragging ?? time)}</Typography>
        <Slider size="small" min={0} max={e.duration || 1} step={0.1} value={dragging ?? time} disabled={!ready}
          aria-label="Position"
          onChange={(_, v) => setDragging(v as number)}
          onChangeCommitted={(_, v) => { e.seek(v as number); setDragging(null); }} />
        <Typography variant="caption" sx={{ minWidth: 34, fontVariantNumeric: 'tabular-nums' }}>{clock(e.duration)}</Typography>
      </Stack>
      <Stack direction="row" spacing={2} sx={{ justifyContent: 'center' }}>
        <IconButton aria-label="Back 5 seconds" disabled={!ready} onClick={() => e.seek(e.time - 5)}><Replay5Icon /></IconButton>
        <IconButton aria-label={e.playing ? 'Pause' : 'Play'} disabled={!ready} color="primary" size="large"
          onClick={() => (e.playing ? e.pause() : e.play())}>
          {e.playing ? <PauseIcon fontSize="large" /> : <PlayArrowIcon fontSize="large" />}
        </IconButton>
        <IconButton aria-label="Forward 5 seconds" disabled={!ready} onClick={() => e.seek(e.time + 5)}><Forward5Icon /></IconButton>
      </Stack>
    </Stack>
  );
}
