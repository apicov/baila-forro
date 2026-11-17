import { useState } from 'react';
import {
  Alert, Button, ButtonGroup, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Stack,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import IosShareIcon from '@mui/icons-material/IosShare';
import RestoreIcon from '@mui/icons-material/Restore';
import {
  type Role, add, move, nextRole, nudge, remove, setRole, shiftRange, shiftRolesFrom, stretchRange,
} from '@/beats/model';
import type { useBeatEdits } from '@/beats/useBeatEdits';
import { engine } from '@/audio/useEngine';
import type { SongRow } from '@/library/db';
import { exportBeats } from '@/services/exportBeats';
import { ROLE_COLORS } from '@/theme/theme';
import { useTheme } from '@mui/material';
import { Timeline, type WaveView, WaveViewToggle } from './Timeline';

const WINDOWS = [3, 6, 12, 24]; // seconds on screen
const STEPS_MS = [5, 10, 50];
const ROLE_NAME: Record<Role, string> = { 1: 'one', 2: 'two', 3: 'three', 0: 'pause' };

type Edits = ReturnType<typeof useBeatEdits>;

export function BeatEditor({ song, edits, view, onView }: {
  song: SongRow; edits: Edits; view: WaveView; onView: (v: WaveView) => void;
}) {
  const { beats, apply, undo, canUndo, revert, edited } = edits;
  const theme = useTheme();
  const roleColors = ROLE_COLORS[theme.palette.mode === 'dark' ? 'dark' : 'paper'];
  const [selected, setSelected] = useState<number | null>(null);
  const [rangeMode, setRangeMode] = useState(false);
  const [range, setRange] = useState<{ a: number; b: number } | null>(null);
  const [windowSec, setWindowSec] = useState(6);
  const [stepMs, setStepMs] = useState(10);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = stepMs / 1000;
  const sel = selected !== null && selected < beats.length ? selected : null;

  const onTap = (i: number) => {
    setSelected(i);
    if (!rangeMode) return;
    // first tap: start of the range; second: its end; a third starts again
    setRange((r) => (!r || r.a !== r.b ? { a: i, b: i } : { a: Math.min(r.a, i), b: Math.max(r.a, i) }));
  };

  // dragging a step of the range: its last step stretches the range, any other shifts the whole range
  const onDrag = (i: number, t: number, snapshot: boolean) => {
    if (range && range.a !== range.b && i >= range.a && i <= range.b) {
      if (i === range.b) apply((b) => stretchRange(b, range.a, range.b, t), snapshot);
      else apply((b) => shiftRange(b, range.a, range.b, t - b[i].t), snapshot);
    } else {
      apply((b) => move(b, i, t), snapshot);
    }
  };

  const addAtPlayhead = () => {
    let index = 0;
    apply((b) => { const r = add(b, engine.time); index = r.index; return r.beats; });
    setSelected(index);
    setRange(null);
  };

  const removeSelected = () => {
    if (sel === null) return;
    apply((b) => remove(b, sel));
    setSelected(null);
    setRange(null);
  };

  const toggleRange = () => { setRangeMode((m) => !m); setRange(null); };
  const fullRange = range && range.a !== range.b ? range : null;

  const doExport = async () => {
    try { await exportBeats(song, edits.latest.current); }
    catch (e) { setError(`Export failed: ${e instanceof Error ? e.message : String(e)}`); }
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {([1, 2, 3, 0] as Role[]).map((r) => (
          <Stack key={r} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: roleColors[r], display: 'inline-block' }} />
            <Typography variant="caption">{ROLE_NAME[r]}</Typography>
          </Stack>
        ))}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {beats.length} steps{edited ? ' · edited' : ''}
        </Typography>
      </Stack>

      <Timeline beats={beats} view={view} showSteps editable selected={sel}
        range={fullRange ?? (range ? { a: range.a, b: range.a } : null)} windowSec={windowSec}
        onTap={onTap}
        onDragStart={(i) => { setSelected(i); onDrag(i, beats[i].t, true); }}
        onDrag={(i, t) => onDrag(i, t, false)} />

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* the selected step */}
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Tooltip title="Undo"><span><IconButton onClick={undo} disabled={!canUndo} aria-label="Undo"><UndoIcon /></IconButton></span></Tooltip>
        <Tooltip title="Add a step at the playhead"><IconButton onClick={addAtPlayhead} aria-label="Add a step"><AddIcon /></IconButton></Tooltip>
        <Tooltip title="Delete the selected step"><span><IconButton onClick={removeSelected} disabled={sel === null} aria-label="Delete the step"><DeleteOutlineIcon /></IconButton></span></Tooltip>
        <Chip disabled={sel === null} label={sel === null ? 'No step selected' : `Count: ${ROLE_NAME[beats[sel].role]}`}
          sx={sel === null ? undefined : { bgcolor: roleColors[beats[sel].role], color: 'background.paper', fontWeight: 600 }}
          onClick={sel === null ? undefined : () => apply((b) => setRole(b, sel, nextRole(b[sel].role)))} />
        <ButtonGroup size="small" disabled={sel === null}>
          <Button onClick={() => sel !== null && apply((b) => nudge(b, sel, -step))}>−{stepMs} ms</Button>
          <Button onClick={() => sel !== null && apply((b) => nudge(b, sel, step))}>+{stepMs} ms</Button>
        </ButtonGroup>
      </Stack>

      {/* the count from the selected step on */}
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ minWidth: 120 }}>Count from here</Typography>
        <ButtonGroup size="small" disabled={sel === null}>
          <Button onClick={() => sel !== null && apply((b) => shiftRolesFrom(b, sel, -1))}>◀ one slot earlier</Button>
          <Button onClick={() => sel !== null && apply((b) => shiftRolesFrom(b, sel, 1))}>one slot later ▶</Button>
        </ButtonGroup>
      </Stack>

      {/* a range of steps */}
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <ToggleButton value="range" size="small" selected={rangeMode} onChange={toggleRange}>Range</ToggleButton>
        {rangeMode && !fullRange && (
          <Typography variant="body2" color="text.secondary">
            {range ? 'Now tap the last step of the range' : 'Tap the first step of the range'}
          </Typography>
        )}
        {fullRange && (
          <>
            <Typography variant="body2">{fullRange.b - fullRange.a + 1} steps:</Typography>
            <ButtonGroup size="small">
              <Button onClick={() => apply((b) => shiftRange(b, fullRange.a, fullRange.b, -step))}>shift −</Button>
              <Button onClick={() => apply((b) => shiftRange(b, fullRange.a, fullRange.b, step))}>shift +</Button>
            </ButtonGroup>
            <ButtonGroup size="small">
              <Button onClick={() => apply((b) => stretchRange(b, fullRange.a, fullRange.b, b[fullRange.b].t - step))}>stretch −</Button>
              <Button onClick={() => apply((b) => stretchRange(b, fullRange.a, fullRange.b, b[fullRange.b].t + step))}>stretch +</Button>
            </ButtonGroup>
          </>
        )}
      </Stack>
      {fullRange && (
        <Typography variant="caption" color="text.secondary">
          Drag the last step to stretch the range (the first stays put), any other step to shift it all.
        </Typography>
      )}

      <Divider />

      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2">Step</Typography>
        <ToggleButtonGroup size="small" exclusive value={stepMs} onChange={(_, v) => v && setStepMs(v)}>
          {STEPS_MS.map((s) => <ToggleButton key={s} value={s}>{s} ms</ToggleButton>)}
        </ToggleButtonGroup>
        <IconButton aria-label="Zoom in" disabled={windowSec === WINDOWS[0]}
          onClick={() => setWindowSec(WINDOWS[WINDOWS.indexOf(windowSec) - 1])}><ZoomInIcon /></IconButton>
        <IconButton aria-label="Zoom out" disabled={windowSec === WINDOWS[WINDOWS.length - 1]}
          onClick={() => setWindowSec(WINDOWS[WINDOWS.indexOf(windowSec) + 1])}><ZoomOutIcon /></IconButton>
        <Typography variant="caption" color="text.secondary">{windowSec} s</Typography>
        <WaveViewToggle view={view} onChange={onView} />
      </Stack>

      <Stack direction="row" spacing={1}>
        <Button variant="contained" startIcon={<IosShareIcon />} onClick={() => void doExport()}>Export beats</Button>
        <Button startIcon={<RestoreIcon />} disabled={!edited || !song.beatsOriginal} onClick={() => setConfirmRevert(true)}>Revert</Button>
      </Stack>

      <Dialog open={confirmRevert} onClose={() => setConfirmRevert(false)}>
        <DialogTitle>Back to the original beats?</DialogTitle>
        <DialogContent>Your edits to this song are dropped (Undo still brings them back while the song is open).</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRevert(false)}>Cancel</Button>
          <Button color="error" onClick={() => { revert(); setSelected(null); setRange(null); setConfirmRevert(false); }}>Revert</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
