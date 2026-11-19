import { Box, Slider, Stack, Switch, Typography, useTheme } from '@mui/material';
import { TRACKS, type Track } from '@/audio/engine';
import { useEngine } from '@/audio/useEngine';
import { STEM_COLORS } from '@/theme/theme';

const LABEL: Record<Track, string> = {
  vocals: 'Vocals', guitar: 'Guitar', piano: 'Piano', bass: 'Bass', drums: 'Drums', other: 'Other', clicks: 'Clicks',
};

/** One cell per track: on/off and volume (the volume is kept while a track is off). As many columns as fit: two on
 *  most phones, one on narrow ones, more on tablets. */
export function Mixer({ hasBeats }: { hasBeats: boolean }) {
  const e = useEngine();
  const colors = STEM_COLORS[useTheme().palette.mode === 'dark' ? 'dark' : 'paper'];
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', columnGap: 2 }}>
      {TRACKS.map((t) => {
        const present = t === 'clicks' ? hasBeats : e.has(t);
        const { on, volume } = e.tracks[t];
        return (
          <Stack key={t} direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0, opacity: present ? 1 : 0.4 }}>
            <Switch size="small" checked={on && present} disabled={!present} onChange={(_, v) => e.setTrack(t, { on: v })}
              slotProps={{ input: { 'aria-label': `${LABEL[t]} on` } }} />
            {/* the stem's colour on the timeline */}
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
              bgcolor: t === 'clicks' ? 'transparent' : colors[t], border: t === 'clicks' ? 1 : 0, borderColor: 'text.secondary' }} />
            <Typography variant="body2" noWrap sx={{ width: 46, flexShrink: 0, fontWeight: t === 'clicks' ? 600 : 400 }}>{LABEL[t]}</Typography>
            <Slider size="small" min={0} max={1.5} step={0.05} value={volume} disabled={!present || !on}
              aria-label={`${LABEL[t]} volume`} valueLabelDisplay="auto"
              // the thumb stays inside the cell at the ends; touch: a shorter row, still easy to grab
              sx={{ minWidth: 0, mx: '7px', '@media (pointer: coarse)': { py: 1.5 } }}
              valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
              onChange={(_, v) => e.setTrack(t, { volume: v as number })} />
          </Stack>
        );
      })}
    </Box>
  );
}
