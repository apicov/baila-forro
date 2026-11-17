import type { Beat } from '@/beats/model';
import { clicksInWindow } from './clicks';
import { computePeaks, resampleLinear } from './engine';

describe('clicksInWindow', () => {
  const beats: Beat[] = [{ t: 1, role: 1 }, { t: 1.4, role: 2 }, { t: 1.8, role: 3 }, { t: 2.2, role: 0 }, { t: 2.6, role: 1 }];

  it('gives the steps in [from, to) and leaves the pause silent', () => {
    expect(clicksInWindow(beats, 1.4, 2.6).map((b) => b.t)).toEqual([1.4, 1.8]);
    expect(clicksInWindow(beats, 0, 10).map((b) => b.role)).toEqual([1, 2, 3, 1]);
    expect(clicksInWindow(beats, 3, 4)).toEqual([]);
  });

  it('never gives a step twice to back-to-back windows', () => {
    const a = clicksInWindow(beats, 0, 1.4), b = clicksInWindow(beats, 1.4, 3);
    expect([...a, ...b].map((x) => x.t)).toEqual([1, 1.4, 1.8, 2.6]);
  });
});

describe('computePeaks', () => {
  it('keeps the loudest sample of each slice', () => {
    const data = new Float32Array([0.1, -0.5, 0.2, 0.3, 0, -0.9, 0.4]);
    expect([...computePeaks(data, 8, 2)].map((v) => Math.round(v * 10) / 10)).toEqual([0.5, 0.9]);
  });
});

describe('resampleLinear', () => {
  it('keeps a ramp a ramp at the new length', () => {
    const src = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]);
    const dst = new Float32Array(4);
    resampleLinear(src, dst);
    expect([...dst]).toEqual([0, 2, 4, 6]);
  });

  it('interpolates between samples and holds the last one', () => {
    const dst = new Float32Array(3);
    resampleLinear(new Float32Array([0, 1]), dst);
    expect([...dst].map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 0.667, 1]);
  });
});
