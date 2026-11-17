import type { Beat } from '@/beats/model';
import { clicksInWindow } from './clicks';
import { MixEngine, computePeaks, peakMaxima, resampleLinear } from './engine';

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

describe('peakMaxima', () => {
  it("gives each stem's loudest slice and the loudest moment of all of them together", () => {
    const m = peakMaxima({ bass: new Float32Array([0.2, 0.8, 0.1]), drums: new Float32Array([0.9, 0.1, 0.5]) });
    expect(m.each).toEqual({ bass: expect.closeTo(0.8, 5), drums: expect.closeTo(0.9, 5) });
    expect(m.sum).toBeCloseTo(1.1, 5); // 0.2 + 0.9, more than 0.8 + 0.1 and 0.1 + 0.5
  });

  it('is empty with no stems', () => {
    expect(peakMaxima({})).toEqual({ each: {}, sum: 0 });
  });
});

describe('smoothTime', () => {
  it('moves the same amount each frame while the audio clock jumps 32 ms every other frame', () => {
    const e = new MixEngine();
    const ctx = { currentTime: 0, outputLatency: 0, baseLatency: 0 };
    Object.assign(e, { ctx, playing: true, duration: 100, offset: 0, startedAt: 0 });
    const frame = 1000 / 60, steps: number[] = [];
    let last = 0;
    for (let n = 1; n <= 300; n++) {
      ctx.currentTime = Math.floor((n * frame) / 32) * 0.032; // the clock as Chrome reports it: 0, 32, 0, 32 ms…
      const t = e.smoothTime(n * frame);
      if (n > 60) steps.push((t - last) * 1000);
      last = t;
    }
    expect(Math.min(...steps)).toBeGreaterThan(frame - 3);
    expect(Math.max(...steps)).toBeLessThan(frame + 3);
    expect(Math.abs(last - 300 * frame / 1000)).toBeLessThan(0.03); // and keeps up with the sound
  });

  it('follows a jump at once', () => {
    const e = new MixEngine();
    Object.assign(e, { playing: false, offset: 42 });
    expect(e.smoothTime(0)).toBe(42);
  });
});
