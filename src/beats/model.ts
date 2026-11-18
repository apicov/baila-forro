/** The forró step grid of a song (`<song>_beats.json`, version 2) and the edits the beat editor makes to it.
 *
 *  `steps` has four slots per cycle: one, two, three, pause. `ones`/`twos`/`threes` are subsets of `steps`;
 *  a step in none of them is the pause (silent). Here each step carries its role instead: 1, 2, 3 or 0 (pause).
 *  Every edit returns a new array and keeps it sorted by time. */

export type Role = 0 | 1 | 2 | 3;
export interface Beat { t: number; role: Role }

export interface BeatsFile {
  steps: number[];
  ones: number[];
  twos: number[];
  threes: number[];
  [key: string]: unknown;
}

/** The order of the roles in a cycle. */
const CYCLE: Role[] = [1, 2, 3, 0];
/** Two steps never come closer than this (seconds): keeps the order when dragging. */
export const MIN_GAP = 0.05;

export function nextRole(r: Role, by = 1): Role {
  return CYCLE[(((CYCLE.indexOf(r) + by) % 4) + 4) % 4];
}

export function parse(file: BeatsFile): Beat[] {
  const ones = new Set(file.ones), twos = new Set(file.twos), threes = new Set(file.threes);
  return [...file.steps].sort((a, b) => a - b).map((t) => ({
    t, role: ones.has(t) ? 1 : twos.has(t) ? 2 : threes.has(t) ? 3 : 0,
  }));
}

const ms = (t: number) => Math.round(t * 1000) / 1000;

/** The file with the edited steps; every other field of the original is kept. */
export function serialize(beats: Beat[], original: BeatsFile): BeatsFile {
  const of = (role: Role) => beats.filter((b) => b.role === role).map((b) => ms(b.t));
  return { ...original, steps: beats.map((b) => ms(b.t)), ones: of(1), twos: of(2), threes: of(3) };
}

/** Index of the first beat at or after `t` (beats.length if none). */
export function lowerBound(beats: Beat[], t: number): number {
  let lo = 0, hi = beats.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid].t < t) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** The free room around beats a..b: they can move between these times without passing a neighbour. */
function room(beats: Beat[], a: number, b: number): [number, number] {
  return [a > 0 ? beats[a - 1].t + MIN_GAP : 0, b < beats.length - 1 ? beats[b + 1].t - MIN_GAP : Infinity];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function move(beats: Beat[], i: number, t: number): Beat[] {
  const [lo, hi] = room(beats, i, i);
  return beats.map((b, j) => (j === i ? { ...b, t: clamp(t, lo, hi) } : b));
}

export function nudge(beats: Beat[], i: number, delta: number): Beat[] {
  return move(beats, i, beats[i].t + delta);
}

/** Adds a step at `t` with the role that follows the step before it (or precedes the one after it). */
export function add(beats: Beat[], t: number): { beats: Beat[]; index: number } {
  const i = lowerBound(beats, t);
  const role = i > 0 ? nextRole(beats[i - 1].role) : beats.length ? nextRole(beats[0].role, -1) : 1;
  return { beats: [...beats.slice(0, i), { t: Math.max(0, t), role }, ...beats.slice(i)], index: i };
}

export function remove(beats: Beat[], i: number): Beat[] {
  return beats.filter((_, j) => j !== i);
}

export function setRole(beats: Beat[], i: number, role: Role): Beat[] {
  return beats.map((b, j) => (j === i ? { ...b, role } : b));
}

/** Rotates the count (1→2→3→pause) of every step from `i` on: fixes a count that is off by a slot. */
export function shiftRolesFrom(beats: Beat[], i: number, by: number): Beat[] {
  return beats.map((b, j) => (j >= i ? { ...b, role: nextRole(b.role, by) } : b));
}

/** Moves steps a..b together, as far as the neighbours allow. */
export function shiftRange(beats: Beat[], a: number, b: number, delta: number): Beat[] {
  const [lo, hi] = room(beats, a, b);
  const d = clamp(delta, lo - beats[a].t, hi - beats[b].t);
  return beats.map((x, j) => (j >= a && j <= b ? { ...x, t: x.t + d } : x));
}

/** Keeps step a in place, moves step b to `tb` and spaces the steps in between in proportion: fixes a
 *  passage whose tempo drifts. */
export function stretchRange(beats: Beat[], a: number, b: number, tb: number): Beat[] {
  if (b <= a) return beats;
  const ta = beats[a].t, old = beats[b].t - ta;
  // the shortest gap between a and b must stay at least MIN_GAP
  let minGap = Infinity;
  for (let j = a; j < b; j++) minGap = Math.min(minGap, beats[j + 1].t - beats[j].t);
  const [, hi] = room(beats, b, b);
  const span = clamp(tb, ta + old * (MIN_GAP / minGap), hi) - ta;
  const k = span / old;
  return beats.map((x, j) => (j > a && j <= b ? { ...x, t: ta + (x.t - ta) * k } : x));
}

/** Repeats steps a..b `n` times after themselves, over the steps that were there: a passage that keeps the
 *  same pattern. The copies come every `period` = k × the pattern's average gap (k steps), so the slot after
 *  its last step is kept (a 1·2·3·pause cycle repeats as such). Copies past `maxT` are left out. Returns the
 *  index of the last copy, for the range of the whole repeated part. */
export function repeatRange(beats: Beat[], a: number, b: number, n: number, maxT = Infinity): { beats: Beat[]; b: number } {
  const k = b - a + 1;
  if (k < 2 || n < 1) return { beats, b };
  const gap = (beats[b].t - beats[a].t) / (k - 1), period = k * gap;
  const copies: Beat[] = [];
  for (let c = 1; c <= n; c++) {
    for (let j = a; j <= b; j++) {
      const t = beats[j].t + c * period;
      if (t <= maxT) copies.push({ t, role: beats[j].role });
    }
  }
  const last = copies.length ? copies[copies.length - 1].t : beats[b].t;
  const end = Math.max(Math.min(beats[a].t + (n + 1) * period - gap / 2, maxT), last + MIN_GAP);
  const after = beats.slice(b + 1).filter((x) => x.t >= end);
  return { beats: [...beats.slice(0, b + 1), ...copies, ...after], b: b + copies.length };
}

/** The steps from threes marked by hand (two or more): the closest two marks are taken as one cycle; between
 *  each two marks go as many whole cycles as fit (pause · one · two · three), evenly spaced so they land on
 *  the marks (a tempo that drifts is followed). The steps that were there are replaced. Returns the indices of
 *  the first and last mark in the result. */
export function fillFromThrees(beats: Beat[], marks: number[]): { beats: Beat[]; a: number; b: number } | null {
  const ms = [...marks].sort((x, y) => x - y).filter((m, i, all) => i === 0 || m - all[i - 1] >= MIN_GAP);
  if (ms.length < 2) return null;
  let cycle = Infinity;
  for (let i = 1; i < ms.length; i++) cycle = Math.min(cycle, ms[i] - ms[i - 1]);
  const filled: Beat[] = [];
  let firstGap = 0, lastGap = 0;
  for (let i = 0; i + 1 < ms.length; i++) {
    const span = ms[i + 1] - ms[i], slots = 4 * Math.max(1, Math.round(span / cycle)), gap = span / slots;
    if (i === 0) firstGap = gap;
    lastGap = gap;
    for (let s = 0; s < slots; s++) filled.push({ t: ms[i] + s * gap, role: ([3, 0, 1, 2] as Role[])[s % 4] });
  }
  filled.push({ t: ms[ms.length - 1], role: 3 });
  const from = ms[0] - firstGap / 2, to = ms[ms.length - 1] + lastGap / 2;
  const before = beats.filter((x) => x.t < from), after = beats.filter((x) => x.t >= to);
  return { beats: [...before, ...filled, ...after], a: before.length, b: before.length + filled.length - 1 };
}
