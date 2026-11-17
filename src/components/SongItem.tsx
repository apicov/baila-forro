import { useState } from 'react';
import {
  Box, Card, CardActionArea, CardContent, CircularProgress, IconButton, Menu, MenuItem, Typography, alpha,
} from '@mui/material';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import PauseIcon from '@mui/icons-material/Pause';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useEngine } from '@/audio/useEngine';
import { STEMS, type SongRow } from '@/library/db';

export interface ItemAction { label: string; onClick: () => void; disabled?: boolean }

/** A song in a list: tap to play it; the one playing (or paused, or loading) is tinted and marked. */
export function SongItem({ song, onPlay, actions }: { song: SongRow; onPlay: () => void; actions: ItemAction[] }) {
  const e = useEngine();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = e.songId === song.id;
  return (
    <Card sx={(t) => ({ display: 'flex', alignItems: 'center',
      ...(current && { bgcolor: alpha(t.palette.primary.main, 0.12), outline: `1px solid ${alpha(t.palette.primary.main, 0.5)}` }) })}>
      <CardActionArea onClick={onPlay} aria-current={current ? 'true' : undefined}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {current && (
            <Box sx={{ display: 'flex', color: 'primary.main' }} aria-label={e.loading ? 'Loading' : e.playing ? 'Playing' : 'Paused'}>
              {e.loading ? <CircularProgress size={22} /> : e.playing ? <GraphicEqIcon /> : <PauseIcon />}
            </Box>
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{song.title}</Typography>
            <Typography variant="body2" color="text.secondary">
              {song.stems.length}/{STEMS.length} stems
              {song.beatsOriginal ? ` · ${song.beatsOriginal.bpm ?? '?'} bpm` : ' · no beats file'}
              {song.beatsEdited ? ' · beats edited' : ''}
              {song.files ? ' · in a folder' : ''}
            </Typography>
          </Box>
        </CardContent>
      </CardActionArea>
      <IconButton aria-label={`More for ${song.title}`} onClick={(ev) => setAnchor(ev.currentTarget)} sx={{ mx: 0.5 }}>
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {actions.map((a) => (
          <MenuItem key={a.label} disabled={a.disabled} onClick={() => { setAnchor(null); a.onClick(); }}>{a.label}</MenuItem>
        ))}
      </Menu>
    </Card>
  );
}
