import { Slider, Stack, Switch, Typography } from '@mui/material';
import { TRACKS, type Track } from '@/audio/engine';
import { useEngine } from '@/audio/useEngine';

const LABEL: Record<Track, string> = {
  vocals: 'Vocals', guitar: 'Guitar', piano: 'Piano', bass: 'Bass', drums: 'Drums', other: 'Other', clicks: 'Clicks (steps)',
};

/** One row per track: on/off and volume (the volume is kept while a track is off). */
export function Mixer({ hasBeats }: { hasBeats: boolean }) {
  const e = useEngine();
  return (
    <Stack spacing={0.5}>
      {TRACKS.map((t) => {
        const present = t === 'clicks' ? hasBeats : e.has(t);
        const { on, volume } = e.tracks[t];
        return (
          <Stack key={t} direction="row" spacing={1.5} sx={{ alignItems: 'center', opacity: present ? 1 : 0.4 }}>
            <Switch checked={on && present} disabled={!present} onChange={(_, v) => e.setTrack(t, { on: v })}
              slotProps={{ input: { 'aria-label': `${LABEL[t]} on` } }} />
            <Typography sx={{ width: 110, flexShrink: 0, fontWeight: t === 'clicks' ? 600 : 400 }}>{LABEL[t]}</Typography>
            <Slider size="small" min={0} max={1.5} step={0.05} value={volume} disabled={!present || !on}
              aria-label={`${LABEL[t]} volume`} valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
              onChange={(_, v) => e.setTrack(t, { volume: v as number })} />
          </Stack>
        );
      })}
    </Stack>
  );
}
