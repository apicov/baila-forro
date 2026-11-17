import fs from 'node:fs';
import path from 'node:path';
import {
  type Beat, type BeatsFile, MIN_GAP, add, lowerBound, move, nextRole, nudge, parse, remove, serialize,
  setRole, shiftRange, shiftRolesFrom, stretchRange,
} from './model';

const beats = (...ts: number[]): Beat[] => ts.map((t, i) => ({ t, role: ([1, 2, 3, 0] as const)[i % 4] }));
const times = (bs: Beat[]) => bs.map((b) => Math.round(b.t * 1000) / 1000);
const sorted = (bs: Beat[]) => bs.every((b, i) => i === 0 || b.t - bs[i - 1].t >= MIN_GAP - 1e-9);

const FILE: BeatsFile = { version: 2, bpm: 88.2, steps: [1, 1.5, 2, 2.5, 3], ones: [1, 3], twos: [1.5], threes: [2] };

describe('parse / serialize', () => {
  it('gives each step its role, pause for steps in none of the lists', () => {
    expect(parse(FILE).map((b) => b.role)).toEqual([1, 2, 3, 0, 1]);
  });

  it('writes the lists back and keeps the other fields', () => {
    const out = serialize(setRole(parse(FILE), 3, 2), FILE);
    expect(out).toMatchObject({ version: 2, bpm: 88.2, steps: [1, 1.5, 2, 2.5, 3], ones: [1, 3], twos: [1.5, 2.5], threes: [2] });
  });

  // the real songs next to the app (forro_music/<song>/<song>_beats.json): unedited, the file comes back the same
  const root = path.resolve(__dirname, '../../..');
  const files = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())
    .flatMap((d) => fs.readdirSync(path.join(root, d.name)).filter((f) => f.endsWith('_beats.json'))
      .map((f) => path.join(root, d.name, f)));
  it.each(files)('round-trips %s', (file) => {
    const json = JSON.parse(fs.readFileSync(file, 'utf8')) as BeatsFile;
    expect(serialize(parse(json), json)).toEqual(json);
  });
});

describe('roles', () => {
  it('cycles 1, 2, 3, pause', () => {
    expect([nextRole(1), nextRole(2), nextRole(3), nextRole(0)]).toEqual([2, 3, 0, 1]);
    expect(nextRole(1, -1)).toBe(0);
  });

  it('shifts the count from a step on', () => {
    expect(shiftRolesFrom(beats(1, 2, 3, 4), 2, 1).map((b) => b.role)).toEqual([1, 2, 0, 1]);
    expect(shiftRolesFrom(beats(1, 2, 3, 4), 2, -1).map((b) => b.role)).toEqual([1, 2, 2, 3]);
  });
});

describe('edits', () => {
  it('moves a step but not past its neighbours', () => {
    expect(times(move(beats(1, 2, 3), 1, 2.2))).toEqual([1, 2.2, 3]);
    expect(times(move(beats(1, 2, 3), 1, 5))).toEqual([1, 3 - MIN_GAP, 3]);
    expect(times(move(beats(1, 2, 3), 0, -1))).toEqual([0, 2, 3]);
    expect(times(nudge(beats(1, 2, 3), 2, 0.01))).toEqual([1, 2, 3.01]);
  });

  it('adds a step in order, with the role after the previous one', () => {
    const { beats: out, index } = add(beats(1, 2, 3), 2.5); // roles 1 2 3
    expect(index).toBe(2);
    expect(times(out)).toEqual([1, 2, 2.5, 3]);
    expect(out[2].role).toBe(3);
    expect(add(beats(1, 2), 0.5).beats[0].role).toBe(0); // before the first: the role before it
    expect(add([], 1).beats).toEqual([{ t: 1, role: 1 }]);
  });

  it('removes a step', () => {
    expect(times(remove(beats(1, 2, 3), 1))).toEqual([1, 3]);
  });

  it('shifts a range together, stopped by the neighbours', () => {
    expect(times(shiftRange(beats(1, 2, 3, 4), 1, 2, 0.3))).toEqual([1, 2.3, 3.3, 4]);
    expect(times(shiftRange(beats(1, 2, 3, 4), 1, 2, 5))).toEqual([1, 3 - MIN_GAP, 4 - MIN_GAP, 4]);
  });

  it('stretches a range from its first step, spacing the inside evenly', () => {
    expect(times(stretchRange(beats(0, 1, 2, 3, 10), 0, 3, 4.5))).toEqual([0, 1.5, 3, 4.5, 10]);
    expect(times(stretchRange(beats(0, 1, 2, 3, 10), 1, 3, 2))).toEqual([0, 1, 1.5, 2, 10]);
  });

  it('never squeezes a stretched range past its order', () => {
    const out = stretchRange(beats(0, 1, 2, 3, 3.2), 0, 3, -5);
    expect(sorted(out)).toBe(true);
    expect(times(stretchRange(beats(0, 1, 2, 3, 3.2), 0, 3, 9))).toEqual(times(beats(0, 1.05, 2.1, 3.15, 3.2)));
  });

  it('finds the first step at or after a time', () => {
    const b = beats(1, 2, 3);
    expect([lowerBound(b, 0), lowerBound(b, 2), lowerBound(b, 2.1), lowerBound(b, 9)]).toEqual([0, 1, 2, 3]);
  });
});
