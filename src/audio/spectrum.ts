/** The spectrogram view: short-time spectra of the stems that are on (mixed at their volumes), a column per
 *  frame of HOP samples, rows on a log frequency axis. Frames are computed only when the timeline needs them,
 *  a few at a time, and kept until the mix changes. */

export const FFT_SIZE = 1024; // 32 ms at 32 kHz: fine enough in time to see each hit
export const HOP = 256;
export const F_MIN = 30;
export const F_MAX = 12000;
const DB_FLOOR = -80; // dB under a full-scale sine: drawn black

/** In-place radix-2 FFT of (re, im); n a power of two. */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { // bit-reversed order
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** For each row (0 = bottom), the fractional FFT bins it covers on a log axis from F_MIN to F_MAX. */
export function rowBins(rows: number, sampleRate: number, size = FFT_SIZE): [number, number][] {
  const binHz = sampleRate / size, fmax = Math.min(F_MAX, sampleRate / 2);
  const f = (r: number) => F_MIN * Math.pow(fmax / F_MIN, r / rows);
  return Array.from({ length: rows }, (_, r) => [f(r) / binHz, f(r + 1) / binHz]);
}

/** The row of a frequency (fractional, 0 = bottom), for the axis labels. */
export function rowOf(hz: number, rows: number, sampleRate: number): number {
  const fmax = Math.min(F_MAX, sampleRate / 2);
  return (rows * Math.log(hz / F_MIN)) / Math.log(fmax / F_MIN);
}

/** Where the samples come from: the stems that are on, mixed. */
export interface MixSource {
  sampleRate: number;
  length: number; // samples
  mix: (start: number, out: Float32Array) => void;
  /** Changes whenever the mix does (a stem on/off, a volume). */
  key: () => string;
}

export class Spectrogram {
  private cache = new Map<number, Uint8Array>();
  private key = '';
  private re = new Float32Array(FFT_SIZE);
  private im = new Float32Array(FFT_SIZE);
  private window = Float32Array.from({ length: FFT_SIZE }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE));
  private bins: [number, number][] = [];
  private binsFor = '';

  constructor(private maxFrames = 8000) {}

  /** The frame centred nearest to time t (seconds). */
  frameAt(t: number, sampleRate: number): number {
    return Math.round((t * sampleRate - FFT_SIZE / 2) / HOP);
  }

  /** A frame's column (row levels 0–255), computed now if `compute` and not cached; undefined if not ready. */
  column(src: MixSource, frame: number, rows: number, compute: boolean): Uint8Array | undefined {
    const key = `${src.key()}|${rows}|${src.sampleRate}`;
    if (key !== this.key) { this.cache.clear(); this.key = key; }
    const hit = this.cache.get(frame);
    if (hit || !compute) return hit;
    const col = this.computeColumn(src, frame, rows);
    if (this.cache.size >= this.maxFrames) this.cache.delete(this.cache.keys().next().value!); // oldest out
    this.cache.set(frame, col);
    return col;
  }

  private computeColumn(src: MixSource, frame: number, rows: number): Uint8Array {
    const { re, im } = this;
    src.mix(frame * HOP, re);
    for (let i = 0; i < FFT_SIZE; i++) { re[i] *= this.window[i]; im[i] = 0; }
    fft(re, im);
    if (this.binsFor !== `${rows}|${src.sampleRate}`) {
      this.bins = rowBins(rows, src.sampleRate);
      this.binsFor = `${rows}|${src.sampleRate}`;
    }
    const half = FFT_SIZE / 2, mag = (k: number) => Math.hypot(re[k], im[k]);
    const col = new Uint8Array(rows);
    for (let r = 0; r < rows; r++) {
      const [b0, b1] = this.bins[r];
      let m: number;
      if (b1 - b0 < 1) { // narrower than a bin (the low end): interpolate
        const c = (b0 + b1) / 2, k = Math.floor(c), f = c - k;
        m = mag(Math.min(half, k)) * (1 - f) + mag(Math.min(half, k + 1)) * f;
      } else {
        m = 0;
        for (let k = Math.floor(b0); k < Math.min(half, Math.ceil(b1)); k++) m = Math.max(m, mag(k));
      }
      const db = 20 * Math.log10(m / (FFT_SIZE / 4) + 1e-9); // a full-scale sine under the Hann window: 0 dB
      col[r] = Math.max(0, Math.min(255, Math.round(((db - DB_FLOOR) / -DB_FLOOR) * 255)));
    }
    return col;
  }
}

/** Dark to bright (an inferno-like ramp), as RGBA for each level 0–255. */
export const COLORMAP: Uint8ClampedArray = (() => {
  const stops = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * (stops.length - 1), k = Math.min(stops.length - 2, Math.floor(x)), f = x - k;
    for (let c = 0; c < 3; c++) lut[i * 4 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f;
    lut[i * 4 + 3] = 255;
  }
  return lut;
})();
