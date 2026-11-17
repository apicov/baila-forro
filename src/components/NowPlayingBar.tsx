import { useEffect, useState } from 'react';
import { ButtonBase, IconButton, LinearProgress, Stack, Typography } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import { useNavigate } from 'react-router-dom';
import { clock, useEngine, usePlaybackTime } from '@/audio/useEngine';
import { usePlayer } from '@/audio/player';
import { db } from '@/library/db';

/** The song playing, at the bottom of the lists: play/pause, next; tap it to open its mixer. */
export function NowPlayingBar() {
  const e = useEngine();
  const p = usePlayer();
  const time = usePlaybackTime(250);
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  useEffect(() => {
    if (e.songId) void db.songs.get(e.songId).then((s) => setTitle(s?.title ?? ''));
  }, [e.songId]);
  if (!e.songId) return null;
  const ready = e.duration > 0 && !e.loading;
  const error = p.error?.songId === e.songId ? p.error.message : null;
  const status = error ? `Couldn't open: ${error}`
    : e.loading ? `Loading ${Math.round((100 * e.loading.done) / Math.max(1, e.loading.total))}%`
      : `${clock(time)} / ${clock(e.duration)}`;
  return (
    <Stack>
      <LinearProgress variant="determinate" value={e.duration ? (100 * time) / e.duration : 0} sx={{ height: 2, mx: -2 }}
        aria-label="Position" />
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, py: 0.5 }}>
        <ButtonBase onClick={() => navigate(`/song/${encodeURIComponent(e.songId!)}`)} aria-label={`Open ${title}`}
          sx={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', textAlign: 'left', py: 0.75, borderRadius: 1 }}>
          <Stack sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 600 }}>{title}</Typography>
            <Typography variant="caption" noWrap color={error ? 'error' : 'text.secondary'} sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {status}
            </Typography>
          </Stack>
        </ButtonBase>
        <IconButton aria-label={e.playing ? 'Pause' : 'Play'} disabled={!ready} color="primary" size="large"
          onClick={() => (e.playing ? e.pause() : e.play())}>
          {e.playing ? <PauseIcon fontSize="large" /> : <PlayArrowIcon fontSize="large" />}
        </IconButton>
        <IconButton aria-label="Next song" disabled={!p.hasNext} onClick={() => p.next()}><SkipNextIcon /></IconButton>
      </Stack>
    </Stack>
  );
}
