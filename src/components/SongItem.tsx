import { useState } from 'react';
import {
  Box, Button, Card, CardActionArea, CardContent, CircularProgress, Dialog, DialogActions, DialogTitle, IconButton, List,
  ListItemButton, ListItemText, Menu, MenuItem, Typography, alpha,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import PauseIcon from '@mui/icons-material/Pause';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useEngine } from '@/audio/useEngine';
import { RHYTHMS, type Rhythm, STEMS, type SongRow, setTags } from '@/library/db';
import { RHYTHM_LABEL, VERDICT_LABEL } from '@/library/tags';

export interface ItemAction { label: string; onClick: () => void; disabled?: boolean }

/** A song in a list: tap to play it; the one playing (or paused, or loading) is tinted and marked. Its tags show
 *  (✓ looks right, ⚠ needs a fix, the rhythm); Rhythm… in its menu tags it without opening it. */
export function SongItem({ song, onPlay, actions, onTagged }: {
  song: SongRow; onPlay: () => void; actions: ItemAction[]; onTagged: () => void;
}) {
  const e = useEngine();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [tagging, setTagging] = useState(false);
  const tagRhythm = (r: Rhythm | null) => { setTagging(false); void setTags(song.id, { rhythm: r }).then(onTagged); };
  const verdict = song.review?.verdict;
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
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {verdict && (
                <Box component="span" aria-label={VERDICT_LABEL[verdict]} title={VERDICT_LABEL[verdict]}
                  sx={{ display: 'inline-flex', verticalAlign: '-3px', mr: 0.75, color: verdict === 'right' ? 'success.main' : 'warning.main' }}>
                  {verdict === 'right' ? <CheckCircleIcon fontSize="small" /> : <ReportProblemIcon fontSize="small" />}
                </Box>
              )}
              {song.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {song.rhythm && <b>{RHYTHM_LABEL[song.rhythm]} · </b>}
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
        <MenuItem onClick={() => { setAnchor(null); setTagging(true); }}>Rhythm…</MenuItem>
        {actions.map((a) => (
          <MenuItem key={a.label} disabled={a.disabled} onClick={() => { setAnchor(null); a.onClick(); }}>{a.label}</MenuItem>
        ))}
      </Menu>
      <Dialog open={tagging} onClose={() => setTagging(false)} fullWidth maxWidth="xs">
        <DialogTitle>Rhythm of “{song.title}”</DialogTitle>
        <List>
          {[...RHYTHMS, null].map((r) => (
            <ListItemButton key={r ?? 'none'} selected={(song.rhythm ?? null) === r} onClick={() => tagRhythm(r)}>
              <ListItemText primary={r ? RHYTHM_LABEL[r] : 'Not set'} />
            </ListItemButton>
          ))}
        </List>
        <DialogActions><Button onClick={() => setTagging(false)}>Cancel</Button></DialogActions>
      </Dialog>
    </Card>
  );
}
