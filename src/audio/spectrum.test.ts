import { FFT_SIZE, HOP, type MixSource, Spectrogram, fft, rowBins, rowOf } from './spectrum';

const RATE = 32000;

/** A sine of `hz` for `seconds`, as a mix source. */
function sine(hz: number, seconds = 1, amp = 1): MixSource {
  const data = Float32Array.from({ length: RATE * seconds }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / RATE));
  return {
    sampleRate: RATE, length: data.length, key: () => `sine${hz}`,
    mix: (start, out) => { for (let i = 0; i < out.length; i++) out[i] = data[start + i] ?? 0; },
  };
}

describe('fft', () => {
  it('puts a sine in its bin', () => {
    const re = Float32Array.from({ length: 64 }, (_, i) => Math.cos((2 * Math.PI * 5 * i) / 64));
    const im = new Float32Array(64);
    fft(re, im);
    const mags = [...re].map((r, k) => Math.hypot(r, im[k]));
    expect(mags.indexOf(Math.max(...mags.slice(0, 32)))).toBe(5);
    expect(mags[5]).toBeCloseTo(32, 3); // n/2 for a unit cosine
  });
});

describe('rows', () => {
  it('cover the log axis from bottom to top without gaps', () => {
    const bins = rowBins(100, RATE);
    expect(bins[0][0]).toBeCloseTo(30 / (RATE / FFT_SIZE), 5);
    expect(bins[99][1]).toBeCloseTo(12000 / (RATE / FFT_SIZE), 3);
    for (let r = 1; r < 100; r++) expect(bins[r][0]).toBeCloseTo(bins[r - 1][1], 9);
  });

  it('place a frequency on its row', () => {
    expect(rowOf(30, 100, RATE)).toBeCloseTo(0, 9);
    expect(rowOf(12000, 100, RATE)).toBeCloseTo(100, 9);
  });
});

describe('Spectrogram', () => {
  it('lights the row of a 1 kHz tone, bright, and little else', () => {
    const spec = new Spectrogram();
    const col = spec.column(sine(1000), spec.frameAt(0.5, RATE), 120, true)!;
    const brightest = col.indexOf(Math.max(...col));
    expect(Math.abs(brightest - rowOf(1000, 120, RATE))).toBeLessThan(1.5);
    expect(col[brightest]).toBeGreaterThan(230); // a full-scale sine: near the top of the scale
    expect(col[Math.round(rowOf(100, 120, RATE))]).toBeLessThan(80);
  });

  it('computes a frame only when asked, and keeps it until the mix changes', () => {
    const spec = new Spectrogram();
    let calls = 0, key = 'a';
    const src: MixSource = { ...sine(440), key: () => key, mix: (s, out) => { calls++; sine(440).mix(s, out); } };
    expect(spec.column(src, 10, 50, false)).toBeUndefined();
    spec.column(src, 10, 50, true);
    spec.column(src, 10, 50, true);
    expect(calls).toBe(1);
    key = 'b';
    expect(spec.column(src, 10, 50, false)).toBeUndefined();
  });

  it('maps a time to the frame centred on it', () => {
    const spec = new Spectrogram();
    const f = spec.frameAt(1, RATE);
    expect(Math.abs(f * HOP + FFT_SIZE / 2 - RATE)).toBeLessThanOrEqual(HOP / 2);
  });
});
