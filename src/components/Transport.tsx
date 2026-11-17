import { useState } from 'react';
import { IconButton, Slider, Stack, Typography } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import Replay5Icon from '@mui/icons-material/Replay5';
import Forward5Icon from '@mui/icons-material/Forward5';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import RepeatOneIcon from '@mui/icons-material/RepeatOne';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import { clock, useEngine, usePlaybackTime } from '@/audio/useEngine';
import { usePlayer } from '@/audio/player';

export function Transport() {
  const e = useEngine();
  const p = usePlayer();
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
      <Stack direction="row" sx={{ justifyContent: 'center', alignItems: 'center', gap: { xs: 0, sm: 1 } }}>
        <IconButton aria-label="Repeat this song" aria-pressed={p.repeatOne} color={p.repeatOne ? 'primary' : 'default'}
          sx={{ opacity: p.repeatOne ? 1 : 0.45 }} onClick={() => p.setRepeatOne(!p.repeatOne)}><RepeatOneIcon /></IconButton>
        <IconButton aria-label="Previous song" onClick={() => p.prev()}><SkipPreviousIcon /></IconButton>
        <IconButton aria-label="Back 5 seconds" disabled={!ready} onClick={() => e.seek(e.time - 5)}><Replay5Icon /></IconButton>
        <IconButton aria-label={e.playing ? 'Pause' : 'Play'} disabled={!ready} color="primary" size="large"
          onClick={() => (e.playing ? e.pause() : e.play())}>
          {e.playing ? <PauseIcon fontSize="large" /> : <PlayArrowIcon fontSize="large" />}
        </IconButton>
        <IconButton aria-label="Forward 5 seconds" disabled={!ready} onClick={() => e.seek(e.time + 5)}><Forward5Icon /></IconButton>
        <IconButton aria-label="Next song" disabled={!p.hasNext} onClick={() => p.next()}><SkipNextIcon /></IconButton>
        <IconButton aria-label="Auto-play the next song" aria-pressed={p.autoNext} color={p.autoNext ? 'primary' : 'default'}
          sx={{ opacity: p.autoNext ? 1 : 0.45 }} onClick={() => p.setAutoNext(!p.autoNext)}><PlaylistPlayIcon /></IconButton>
      </Stack>
    </Stack>
  );
}
