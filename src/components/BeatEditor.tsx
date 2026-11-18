import { useRef, useState } from 'react';
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
  type Role, add, fillFromThrees, move, nextRole, nudge, remove, repeatRange, setRole, shiftRange, shiftRolesFrom,
  stretchRange,
} from '@/beats/model';
import type { useBeatEdits } from '@/beats/useBeatEdits';
import { clock, engine } from '@/audio/useEngine';
import type { SongRow } from '@/library/db';
import { exportBeats } from '@/services/exportBeats';
import { ROLE_COLORS } from '@/theme/theme';
import { useTheme } from '@mui/material';
import { Timeline, type WaveView, WaveViewToggle } from './Timeline';
import { WINDOWS } from './zoom';

const STEPS_MS = [5, 10, 50];
const ROLE_NAME: Record<Role, string> = { 1: 'one', 2: 'two', 3: 'three', 0: 'pause' };
const DOUBLE_TAP_MS = 350;

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
  const [repeatN, setRepeatN] = useState(4);
  const [markMode, setMarkMode] = useState(false);
  const [marks, setMarks] = useState<number[]>([]);
  const lastTap = useRef({ i: -1, at: 0 });
  const step = stepMs / 1000;
  const sel = selected !== null && selected < beats.length ? selected : null;

  const onTap = (i: number) => {
    setSelected(i);
    const now = performance.now(), double = lastTap.current.i === i && now - lastTap.current.at < DOUBLE_TAP_MS;
    lastTap.current = { i: double ? -1 : i, at: now };
    if (double) { apply((b) => setRole(b, i, nextRole(b[i].role))); return; } // double tap: the next count
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

  // long press: on a step, a range from it; elsewhere, a step right there
  const onLongPress = (i: number | null, t: number) => {
    if (i !== null) {
      setRangeMode(true); setMarkMode(false);
      setSelected(i);
      setRange({ a: i, b: i });
      return;
    }
    let index = 0;
    apply((b) => { const r = add(b, t); index = r.index; return r.beats; });
    setSelected(index);
    setRange(null);
  };

  // Mark 3s: a tap marks a three (on a step: right on it), or takes back the mark under it
  const onTapTime = (t: number, i: number | null, tolerance: number) => {
    const near = marks.findIndex((m) => Math.abs(m - t) < tolerance);
    if (near >= 0) setMarks(marks.filter((_, j) => j !== near));
    else setMarks([...marks, i !== null ? beats[i].t : t]);
  };
  const fill = () => {
    let done: { a: number; b: number } | null = null;
    apply((b) => { const r = fillFromThrees(b, marks); done = r && { a: r.a, b: r.b }; return r ? r.beats : b; });
    setMarks([]);
    setMarkMode(false);
    setRange(done);
    setSelected(null);
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

  const toggleRange = () => { setRangeMode((m) => !m); setRange(null); setMarkMode(false); };
  const toggleMarks = () => { setMarkMode((m) => !m); setRangeMode(false); setRange(null); };
  const fullRange = range && range.a !== range.b ? range : null;

  // repeat ×N: copies every k × the range's average gap (model.repeatRange); then the range is the whole part
  const repeatEnd = (() => {
    if (!fullRange) return 0;
    const k = fullRange.b - fullRange.a + 1, gap = (beats[fullRange.b].t - beats[fullRange.a].t) / (k - 1);
    return Math.min(engine.duration || Infinity, beats[fullRange.b].t + repeatN * k * gap);
  })();
  const doRepeat = () => {
    if (!fullRange) return;
    let last = fullRange.b;
    apply((b) => { const r = repeatRange(b, fullRange.a, fullRange.b, repeatN, engine.duration || Infinity); last = r.b; return r.beats; });
    setRange({ a: fullRange.a, b: last });
  };

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
        onDrag={(i, t) => onDrag(i, t, false)}
        onLongPress={onLongPress} onZoom={setWindowSec}
        marks={markMode ? marks : undefined} onTapTime={markMode ? onTapTime : undefined} />
      <Typography variant="caption" color="text.secondary">
        {markMode
          ? 'Tap where a three falls (on a step: right on it), or Tap 3 along with the music; tap a mark to take it back.'
          : 'Long-press: a step right there, or a range from a step · double-tap a step: next count · pinch: zoom'}
      </Typography>

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
      {fullRange && (
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2">Repeat ×</Typography>
          <ButtonGroup size="small">
            <Button aria-label="Fewer copies" disabled={repeatN <= 1} onClick={() => setRepeatN(repeatN - 1)}>−</Button>
            <Button disabled sx={{ '&.Mui-disabled': { color: 'text.primary' }, minWidth: 40 }}>{repeatN}</Button>
            <Button aria-label="More copies" onClick={() => setRepeatN(repeatN + 1)}>+</Button>
          </ButtonGroup>
          <Button size="small" variant="outlined" onClick={doRepeat}>Repeat</Button>
          <Typography variant="caption" color="text.secondary">up to {clock(repeatEnd)}, over the steps there</Typography>
        </Stack>
      )}

      {/* threes marked by hand, the rest filled in */}
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <ToggleButton value="marks" size="small" selected={markMode} onChange={toggleMarks}>Mark 3s</ToggleButton>
        {markMode && (
          <>
            <Button size="small" variant="contained" disabled={!engine.duration}
              sx={{ bgcolor: roleColors[3], color: 'background.paper', fontWeight: 700, minWidth: 64 }}
              onClick={() => setMarks([...marks, engine.time])}>Tap 3</Button>
            <Button size="small" variant="outlined" disabled={marks.length < 2} onClick={fill}>Fill from 3s</Button>
            <Button size="small" disabled={!marks.length} onClick={() => setMarks([])}>Clear</Button>
            <Typography variant="body2" color="text.secondary">{marks.length} {marks.length === 1 ? 'mark' : 'marks'}</Typography>
          </>
        )}
      </Stack>
      {markMode && (
        <Typography variant="caption" color="text.secondary">
          Mark two threes a cycle apart (that's the cycle), then more further on; Fill puts whole cycles between the
          marks (pause · 1 · 2 · 3), evenly spaced, over the steps there.
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
