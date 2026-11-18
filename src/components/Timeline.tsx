/** A few seconds of the song around the playhead (fixed in the middle): the stems' waveforms in their colours
 *  (or the spectrogram of the stems that are on), and the steps on top. The stems follow the mixer: a stem switched off leaves the picture (stacked) or greys
 *  out (lanes), and the volume scales it. Drag the waveform to scroll (when paused), tap it to jump there.
 *  `editable`: drag a step's handle (the top band) to move it, tap it to select it. */
import { useEffect, useRef } from 'react';
import { ToggleButton, ToggleButtonGroup, useTheme } from '@mui/material';
import { type Beat, lowerBound } from '@/beats/model';
import { PEAKS_PER_SECOND } from '@/audio/engine';
import { COLORMAP, rowOf, Spectrogram } from '@/audio/spectrum';
import { engine } from '@/audio/useEngine';
import { STEMS, type Stem } from '@/library/db';
import { ROLE_COLORS, STEM_COLORS } from '@/theme/theme';
import { nearestWindow } from './zoom';

/** stacked: one shape, each stem a band of it; lanes: a row per stem; spectrum: the spectrogram of the mix. */
export type WaveView = 'stacked' | 'lanes' | 'spectrum';

/** One for the player and the editor: the frames computed in one are there in the other. */
const spectrogram = new Spectrogram();
const SPECTRUM_BUDGET_MS = 6; // computing per animation frame; the rest of the columns come in the next ones
const FREQ_LABELS: [number, string][] = [[100, '100'], [1000, '1k'], [5000, '5k']];

const BAND = 34; // the handles' band at the top
const AXIS = 16; // the seconds along the bottom
// the same height in every view and with the steps on or off (they only share it out differently), so the page
// doesn't jump on a switch: 180 px of picture under the steps, a lane of 30 px for each of the six stems
const HEIGHT = BAND + 180 + AXIS;
const HANDLE_R = 10;
const HIT_PX = 18;
const TAP_PX = 6; // a pointer that moves less than this is a tap
const LONG_PRESS_MS = 500;
const ROLE_LABEL = { 1: '1', 2: '2', 3: '3', 0: '·' } as const;
// stacked from the middle out: the rhythm section closest to the centre line
const STACK_ORDER: Stem[] = ['drums', 'bass', 'guitar', 'piano', 'other', 'vocals'];

export interface TimelineProps {
  beats: Beat[];
  view: WaveView;
  showSteps: boolean;
  editable: boolean;
  windowSec: number;
  selected?: number | null;
  range?: { a: number; b: number } | null;
  onTap?: (i: number) => void;
  onDragStart?: (i: number) => void;
  onDrag?: (i: number, t: number) => void;
  /** Held still: on a step (its index) or elsewhere (null); `t` is the time under the finger. */
  onLongPress?: (i: number | null, t: number) => void;
  /** A pinch: the zoom level it comes to. */
  onZoom?: (windowSec: number) => void;
  /** Times marked as threes (Mark 3s), drawn over the steps. */
  marks?: number[];
  /** Given, a tap calls it instead of selecting or jumping: its time, the step under it (in the band, or null),
   *  and how many seconds a finger's width is. */
  onTapTime?: (t: number, i: number | null, tolerance: number) => void;
}

/** The loudest slice of `peaks` in [k0, k1). */
function maxIn(peaks: Float32Array, k0: number, k1: number): number {
  let v = 0;
  for (let k = Math.max(0, k0); k < Math.min(peaks.length, k1); k++) if (peaks[k] > v) v = peaks[k];
  return v;
}

/** The stems' picture, drawn once per column (a device pixel at a fixed song time) into a ring of columns,
 *  then slid along: shapes stay put as they scroll instead of being re-sampled at each frame's offset. */
interface Ring {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  image: ImageData | null; // the spectrum's pixels
  holds: Float64Array; // the column each slot holds (NaN: none)
  done: Uint8Array; // 0: the spectrum frame wasn't computed yet, try again
  key: string;
}
const RING_SPARE = 128; // columns beyond the screen width

export function Timeline(props: TimelineProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  const live = useRef({ props, theme });
  const ring = useRef<Ring | null>(null);
  const shown = useRef(0); // the song time at the playhead as last drawn
  live.current = { props, theme };

  useEffect(() => {
    const el = canvas.current!;
    let frame = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const { props: p, theme: th } = live.current;
      const mode = th.palette.mode === 'dark' ? 'dark' : 'paper';
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth, h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
      }
      const g = el.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const pps = w / p.windowSec;
      const t0 = (shown.current = engine.smoothTime(now)) - w / 2 / pps;
      const x = (t: number) => (t - t0) * pps;
      const top = p.showSteps ? BAND : 4, bottom = h - AXIS;

      // the range being shifted or stretched
      if (p.range) {
        const a = p.beats[p.range.a]?.t, b = p.beats[p.range.b]?.t;
        if (a !== undefined && b !== undefined) {
          g.fillStyle = th.palette.primary.main + '22';
          g.fillRect(x(a), 0, Math.max(2, x(b) - x(a)), h);
        }
      }

      // the stems, in device pixels: column c covers song time [c, c + 1) / dpps
      const stems = STEMS.filter((s) => engine.peaks[s]);
      const W = el.width, dTop = Math.round(top * dpr), dH = Math.max(1, Math.round(bottom * dpr) - dTop);
      const dpps = pps * dpr, R = W + RING_SPARE, sr = engine.sampleRate;
      const key = [p.view, mode, R, dH, dpps, engine.key(), stems.length, engine.peakMax.sum].join('|');
      let rg = ring.current;
      if (!rg || rg.key !== key) {
        const c = rg && rg.canvas.width === R && rg.canvas.height === dH ? rg.canvas : document.createElement('canvas');
        c.width = R; c.height = dH;
        const holds = new Float64Array(R).fill(NaN);
        rg = ring.current = { canvas: c, g: c.getContext('2d')!, image: p.view === 'spectrum' ? new ImageData(R, dH) : null,
          holds, done: new Uint8Array(R), key };
        rg.g.clearRect(0, 0, R, dH);
      }
      const gain = (s: Stem) => (engine.tracks[s].on ? engine.tracks[s].volume : 0);
      const until = performance.now() + SPECTRUM_BUDGET_MS;
      const first = Math.round(t0 * dpps), slot0 = ((first % R) + R) % R;
      let dirtyFrom = R, dirtyTo = -1;
      for (let c = first; c < first + W; c++) {
        const s = ((c % R) + R) % R;
        if (rg.holds[s] === c && rg.done[s]) continue;
        rg.holds[s] = c; rg.done[s] = 1;
        const k0 = Math.floor((c / dpps) * PEAKS_PER_SECOND), k1 = Math.max(k0 + 1, Math.floor(((c + 1) / dpps) * PEAKS_PER_SECOND));
        if (rg.image) {
          const t = (c + 0.5) / dpps, inSong = t >= 0 && t < engine.duration;
          const col = inSong ? spectrogram.column(engine, spectrogram.frameAt(t, sr), dH, performance.now() < until) : undefined;
          if (inSong && !col) rg.done[s] = 0;
          const px4 = rg.image.data;
          for (let r = 0; r < dH; r++) {
            const i = ((dH - 1 - r) * R + s) * 4, level = col ? col[r] : 0;
            px4[i] = COLORMAP[level * 4]; px4[i + 1] = COLORMAP[level * 4 + 1]; px4[i + 2] = COLORMAP[level * 4 + 2];
            px4[i + 3] = col ? 255 : 40; // not computed yet: faint
          }
          dirtyFrom = Math.min(dirtyFrom, s); dirtyTo = Math.max(dirtyTo, s);
          continue;
        }
        const rc = rg.g;
        rc.clearRect(s, 0, 1, dH);
        if (p.view === 'stacked') {
          const mid = dH / 2, half = dH / 2 - dpr, scale = engine.peakMax.sum || 1;
          let filled = 0; // how far out the column is drawn so far
          for (const st of STACK_ORDER) {
            const peaks = engine.peaks[st], k = gain(st);
            if (!peaks || k === 0) continue;
            const to = Math.min(1, filled + (maxIn(peaks, k0, k1) * k) / scale);
            if ((to - filled) * half < 0.3 * dpr) continue;
            rc.fillStyle = STEM_COLORS[mode][st];
            rc.fillRect(s, mid - to * half, 1, (to - filled) * half); // above the line
            rc.fillRect(s, mid + filled * half, 1, (to - filled) * half); // and its mirror below
            filled = to;
          }
        } else {
          const laneH = dH / Math.max(1, stems.length);
          stems.forEach((st, i) => {
            const on = engine.tracks[st].on, half = laneH / 2 - 2 * dpr;
            const scale = (engine.peakMax.each[st] || 1) / Math.min(1, on ? engine.tracks[st].volume : 1); // each lane full height
            const v = Math.min(1, maxIn(engine.peaks[st]!, k0, k1) / scale) * half;
            if (v <= 0.3 * dpr) return;
            rc.globalAlpha = on ? 1 : 0.25;
            rc.fillStyle = STEM_COLORS[mode][st];
            rc.fillRect(s, (i + 0.5) * laneH - v, 1, 2 * v);
          });
          rc.globalAlpha = 1;
        }
      }
      if (rg.image && dirtyTo >= 0) rg.g.putImageData(rg.image, 0, 0, dirtyFrom, 0, dirtyTo - dirtyFrom + 1, dH);
      // slide the ring on: its slots from slot0 on, then the ones it wrapped round to
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(rg.canvas, slot0, 0, R - slot0, dH, 0, dTop, R - slot0, dH);
      if (slot0 > 0) g.drawImage(rg.canvas, 0, 0, slot0, dH, R - slot0, dTop, slot0, dH);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      // what the picture's rows are
      g.font = '10px Inter, system-ui, sans-serif';
      g.textAlign = 'left';
      if (p.view === 'spectrum') {
        g.fillStyle = '#ffffffcc';
        g.textBaseline = 'middle';
        const rows = dH / dpr;
        for (const [hz, label] of FREQ_LABELS) g.fillText(label, 3, bottom - rowOf(hz, rows, sr));
      } else if (p.view === 'lanes') {
        g.fillStyle = th.palette.text.secondary;
        g.textBaseline = 'top';
        const laneH = (bottom - top) / Math.max(1, stems.length);
        stems.forEach((st, i) => g.fillText(st, 3, top + i * laneH + 1));
      }

      // seconds along the bottom
      g.fillStyle = th.palette.text.secondary;
      g.font = '10px Inter, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      const every = pps < 50 ? 2 : 1;
      for (let sec = Math.ceil(t0 / every) * every; sec <= t0 + w / pps; sec += every) {
        if (sec < 0) continue;
        g.fillRect(x(sec), h - 14, 1, 4);
        g.fillText(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, x(sec), h - 2);
      }

      // the steps: thin neutral lines over the colours, the roles on the handles
      if (p.showSteps) {
        const roles = ROLE_COLORS[mode];
        g.font = '600 11px Inter, system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (let i = Math.max(0, lowerBound(p.beats, t0) - 1); i < p.beats.length && p.beats[i].t < t0 + w / pps + 1; i++) {
          const b = p.beats[i], bx = x(b.t), sel = i === p.selected;
          const line = p.view === 'spectrum' ? '#ffffff' : th.palette.text.primary; // seen over the dark spectrogram
          g.strokeStyle = sel ? roles[b.role] : line + (b.role === 0 ? '55' : '99');
          g.lineWidth = sel ? 3 : 1;
          g.setLineDash(b.role === 0 ? [3, 4] : []);
          g.beginPath(); g.moveTo(bx, BAND - 4); g.lineTo(bx, bottom); g.stroke();
          g.setLineDash([]);
          g.strokeStyle = roles[b.role];
          g.beginPath(); g.arc(bx, BAND / 2, b.role === 0 ? HANDLE_R - 3 : HANDLE_R, 0, 2 * Math.PI);
          if (b.role === 0) { g.lineWidth = 1.5; g.stroke(); } else { g.fillStyle = roles[b.role]; g.fill(); }
          if (sel) { g.lineWidth = 2; g.strokeStyle = th.palette.text.primary; g.beginPath(); g.arc(bx, BAND / 2, HANDLE_R + 3, 0, 2 * Math.PI); g.stroke(); }
          if (b.role !== 0) { g.fillStyle = th.palette.background.paper; g.fillText(ROLE_LABEL[b.role], bx, BAND / 2 + 0.5); }
        }
      }

      // the threes marked (Mark 3s): a ring around the band and a line down, in the three's colour
      if (p.marks?.length) {
        const three = ROLE_COLORS[mode][3];
        g.strokeStyle = three;
        for (const m of p.marks) {
          const mx = x(m);
          if (mx < -HANDLE_R * 2 || mx > w + HANDLE_R * 2) continue;
          g.lineWidth = 2; g.globalAlpha = 0.8;
          g.beginPath(); g.moveTo(mx, BAND - 4); g.lineTo(mx, bottom); g.stroke();
          g.globalAlpha = 1; g.lineWidth = 3;
          g.beginPath(); g.arc(mx, BAND / 2, HANDLE_R + 4, 0, 2 * Math.PI); g.stroke();
        }
      }

      // the playhead
      g.fillStyle = th.palette.error.main;
      g.fillRect(w / 2 - 1, 0, 2, h - 12);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  // pointer: on a handle (editable) → drag/tap a step; elsewhere → scroll (paused) or tap to jump; held still → long
  // press; two fingers → pinch zoom
  const gesture = useRef<{
    id: number; x0: number; time0: number; t: number; beat: number | null; grab: number; moved: boolean; done: boolean;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; window0: number } | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPress = () => { if (press.current) clearTimeout(press.current); press.current = null; };
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  };

  const timeAt = (clientX: number) => {
    const r = canvas.current!.getBoundingClientRect();
    return shown.current + (clientX - r.left - r.width / 2) / (r.width / props.windowSec); // the time where it was drawn
  };

  const onPointerDown = (e: React.PointerEvent) => {
    canvas.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) { // a second finger: a pinch, whatever the first was doing
      cancelPress();
      gesture.current = null;
      pinch.current = { d0: spread(), window0: props.windowSec };
      return;
    }
    if (pointers.current.size > 2) return;
    const r = canvas.current!.getBoundingClientRect();
    const pps = r.width / props.windowSec, t = timeAt(e.clientX);
    let beat: number | null = null;
    if ((props.editable || props.onTapTime) && props.showSteps && e.clientY - r.top < BAND + 10) {
      let best = HIT_PX;
      for (let i = Math.max(0, lowerBound(props.beats, t - HIT_PX / pps) - 1); i < props.beats.length && props.beats[i].t < t + HIT_PX / pps; i++) {
        const d = Math.abs(props.beats[i].t - t) * pps;
        if (d < best) { best = d; beat = i; }
      }
    }
    const gs = { id: e.pointerId, x0: e.clientX, time0: engine.time, t, beat, grab: beat === null ? 0 : props.beats[beat].t - t, moved: false, done: false };
    gesture.current = gs;
    if (props.onLongPress && !props.onTapTime) {
      press.current = setTimeout(() => {
        press.current = null;
        if (gesture.current !== gs || gs.moved) return;
        gs.done = true; // the finger's up and moves are this long press's
        navigator.vibrate?.(15);
        live.current.props.onLongPress?.(gs.beat, gs.t);
      }, LONG_PRESS_MS);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const w = nearestWindow(pinch.current.window0 * (pinch.current.d0 / spread())); // fingers apart: fewer seconds
      if (w !== props.windowSec) props.onZoom?.(w);
      return;
    }
    const gs = gesture.current;
    if (!gs || gs.id !== e.pointerId || gs.done) return;
    if (!gs.moved && Math.abs(e.clientX - gs.x0) < TAP_PX) return;
    cancelPress();
    if (gs.beat !== null && !props.onTapTime) {
      if (!gs.moved) props.onDragStart?.(gs.beat);
      props.onDrag?.(gs.beat, timeAt(e.clientX) + gs.grab);
    } else if (!engine.playing) {
      const pps = canvas.current!.getBoundingClientRect().width / props.windowSec;
      engine.seek(gs.time0 - (e.clientX - gs.x0) / pps);
    }
    gs.moved = true;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    cancelPress();
    const gs = gesture.current;
    if (!gs || gs.id !== e.pointerId) return;
    gesture.current = null;
    if (gs.moved || gs.done) return;
    const tolerance = HIT_PX / (canvas.current!.getBoundingClientRect().width / props.windowSec);
    if (props.onTapTime) props.onTapTime(gs.t, gs.beat, tolerance);
    else if (gs.beat !== null) props.onTap?.(gs.beat);
    else engine.seek(timeAt(e.clientX));
  };

  return (
    <canvas ref={canvas} style={{ width: '100%', height: HEIGHT, display: 'block', touchAction: 'none', cursor: 'pointer' }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerCancel={(e) => { pointers.current.delete(e.pointerId); pinch.current = null; cancelPress(); gesture.current = null; }} />
  );
}

/** The Stacked | Lanes | Spectrum switch, the same in the player and the editor. */
export function WaveViewToggle({ view, onChange }: { view: WaveView; onChange: (v: WaveView) => void }) {
  return (
    <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && onChange(v)} aria-label="Waveform view">
      <ToggleButton value="stacked">Stacked</ToggleButton>
      <ToggleButton value="lanes">Lanes</ToggleButton>
      <ToggleButton value="spectrum">Spectrum</ToggleButton>
    </ToggleButtonGroup>
  );
}
