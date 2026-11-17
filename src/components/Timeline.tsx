/** The beat editor's view: a few seconds of the drums waveform around the playhead (fixed in the middle) with
 *  the steps on it. Drag a step's handle (the top band) to move it, tap it to select it; drag the waveform to
 *  scroll (when paused), tap it to jump there. */
import { useEffect, useRef } from 'react';
import { useTheme } from '@mui/material';
import { type Beat, lowerBound } from '@/beats/model';
import { PEAKS_PER_SECOND } from '@/audio/engine';
import { engine } from '@/audio/useEngine';
import { ROLE_COLORS } from '@/theme/theme';

const HEIGHT = 170;
const BAND = 34; // the handles' band at the top
const HANDLE_R = 10;
const HIT_PX = 18;
const TAP_PX = 6; // a pointer that moves less than this is a tap
const ROLE_LABEL = { 1: '1', 2: '2', 3: '3', 0: '·' } as const;

export interface TimelineProps {
  beats: Beat[];
  selected: number | null;
  range: { a: number; b: number } | null;
  windowSec: number;
  onTap: (i: number) => void;
  onDragStart: (i: number) => void;
  onDrag: (i: number, t: number) => void;
}

export function Timeline(props: TimelineProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  const live = useRef({ props, theme });
  live.current = { props, theme };

  useEffect(() => {
    const el = canvas.current!;
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const { props: p, theme: th } = live.current;
      const roleColors = ROLE_COLORS[th.palette.mode === 'dark' ? 'dark' : 'paper'];
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      if (el.width !== Math.round(w * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(HEIGHT * dpr); }
      const g = el.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, HEIGHT);

      const pps = w / p.windowSec;
      const center = engine.time;
      const t0 = center - w / 2 / pps;
      const x = (t: number) => (t - t0) * pps;

      // the range being shifted or stretched
      if (p.range) {
        const a = p.beats[p.range.a]?.t, b = p.beats[p.range.b]?.t;
        if (a !== undefined && b !== undefined) {
          g.fillStyle = th.palette.primary.main + '22';
          g.fillRect(x(a), 0, Math.max(2, x(b) - x(a)), HEIGHT);
        }
      }

      // waveform
      const peaks = engine.peaks;
      const mid = BAND + (HEIGHT - BAND - 16) / 2, half = (HEIGHT - BAND - 20) / 2;
      if (peaks) {
        g.fillStyle = th.palette.text.secondary + '88';
        for (let px = 0; px < w; px++) {
          const k0 = Math.max(0, Math.floor((t0 + px / pps) * PEAKS_PER_SECOND));
          const k1 = Math.min(peaks.length, Math.max(k0 + 1, Math.floor((t0 + (px + 1) / pps) * PEAKS_PER_SECOND)));
          let v = 0;
          for (let k = k0; k < k1; k++) if (peaks[k] > v) v = peaks[k];
          const h = Math.min(1, v) * half;
          if (h > 0.3) g.fillRect(px, mid - h, 1, 2 * h);
        }
      }

      // seconds along the bottom
      g.fillStyle = th.palette.text.secondary;
      g.font = '10px Inter, system-ui, sans-serif';
      g.textAlign = 'center';
      const every = pps < 50 ? 2 : 1;
      for (let s = Math.ceil(t0 / every) * every; s <= t0 + w / pps; s += every) {
        if (s < 0) continue;
        g.fillRect(x(s), HEIGHT - 14, 1, 4);
        g.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, x(s), HEIGHT - 2);
      }

      // the steps
      g.font = '600 11px Inter, system-ui, sans-serif';
      g.textBaseline = 'middle';
      for (let i = Math.max(0, lowerBound(p.beats, t0) - 1); i < p.beats.length && p.beats[i].t < t0 + w / pps + 1; i++) {
        const b = p.beats[i], bx = x(b.t), sel = i === p.selected;
        const color = roleColors[b.role];
        g.strokeStyle = color;
        g.lineWidth = sel ? 3 : b.role === 0 ? 1 : 1.5;
        g.setLineDash(b.role === 0 ? [3, 4] : []);
        g.beginPath(); g.moveTo(bx, BAND - 4); g.lineTo(bx, HEIGHT - 16); g.stroke();
        g.setLineDash([]);
        g.beginPath(); g.arc(bx, BAND / 2, b.role === 0 ? HANDLE_R - 3 : HANDLE_R, 0, 2 * Math.PI);
        if (b.role === 0) { g.lineWidth = 1.5; g.stroke(); } else { g.fillStyle = color; g.fill(); }
        if (sel) { g.lineWidth = 2; g.strokeStyle = th.palette.text.primary; g.beginPath(); g.arc(bx, BAND / 2, HANDLE_R + 3, 0, 2 * Math.PI); g.stroke(); }
        if (b.role !== 0) { g.fillStyle = th.palette.background.paper; g.fillText(ROLE_LABEL[b.role], bx, BAND / 2 + 0.5); }
      }

      // the playhead
      g.fillStyle = th.palette.error.main;
      g.fillRect(w / 2 - 1, 0, 2, HEIGHT - 12);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, []);

  // pointer: on a handle → drag/tap a step; elsewhere → scroll (paused) or tap to jump
  const gesture = useRef<{ id: number; x0: number; time0: number; beat: number | null; grab: number; moved: boolean } | null>(null);

  const timeAt = (clientX: number) => {
    const el = canvas.current!, r = el.getBoundingClientRect();
    return engine.time + (clientX - r.left - r.width / 2) / (r.width / props.windowSec);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const pps = r.width / props.windowSec, t = timeAt(e.clientX);
    let beat: number | null = null;
    if (e.clientY - r.top < BAND + 10) {
      let best = HIT_PX;
      for (let i = Math.max(0, lowerBound(props.beats, t - HIT_PX / pps) - 1); i < props.beats.length && props.beats[i].t < t + HIT_PX / pps; i++) {
        const d = Math.abs(props.beats[i].t - t) * pps;
        if (d < best) { best = d; beat = i; }
      }
    }
    canvas.current!.setPointerCapture(e.pointerId);
    gesture.current = { id: e.pointerId, x0: e.clientX, time0: engine.time, beat, grab: beat === null ? 0 : props.beats[beat].t - t, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const gs = gesture.current;
    if (!gs || gs.id !== e.pointerId) return;
    if (!gs.moved && Math.abs(e.clientX - gs.x0) < TAP_PX) return;
    if (gs.beat !== null) {
      if (!gs.moved) props.onDragStart(gs.beat);
      props.onDrag(gs.beat, timeAt(e.clientX) + gs.grab);
    } else if (!engine.playing) {
      const pps = canvas.current!.getBoundingClientRect().width / props.windowSec;
      engine.seek(gs.time0 - (e.clientX - gs.x0) / pps);
    }
    gs.moved = true;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const gs = gesture.current;
    if (!gs || gs.id !== e.pointerId) return;
    gesture.current = null;
    if (gs.moved) return;
    if (gs.beat !== null) props.onTap(gs.beat);
    else engine.seek(timeAt(e.clientX));
  };

  return (
    <canvas ref={canvas} style={{ width: '100%', height: HEIGHT, display: 'block', touchAction: 'none', cursor: 'pointer' }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerCancel={() => { gesture.current = null; }} />
  );
}
