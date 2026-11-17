/** Plays the stems of one song in sync, each through its own gain (on/off and volume), plus the clicks.
 *
 *  All the stems are decoded into AudioBuffers and started at the same context time, so they stay
 *  sample-accurate together; seeking restarts them all at the new offset. The context runs at 32 kHz: the
 *  128 kbps mp3s hold nothing above ~16 kHz, and it keeps a decoded song at ~200 MB instead of ~270. */
import type { Beat } from '@/beats/model';
import { STEMS, type Stem, type StemRow } from '@/library/db';
import { clicksInWindow, playClick } from './clicks';

export type Track = Stem | 'clicks';
export const TRACKS: Track[] = [...STEMS, 'clicks'];
export interface TrackState { on: boolean; volume: number }

const SAMPLE_RATE = 32000;
// Decoding: at the stems' own rate (the browser's resampler took about as long as the decoding itself), then a
// linear resample to SAMPLE_RATE here; two stems at a time. Measured on a Galaxy S9+, 6 stems of 4:50: 10.4 s
// one by one with the browser resampling, 4.2 s this way (3 at a time 3.7 s; all 6 at once got the app killed
// for memory).
const DECODE_RATE = 44100;
const DECODE_AT_ONCE = 2;
const LOOKAHEAD = 0.12; // s of clicks scheduled ahead
const TICK_MS = 25;
const START_DELAY = 0.05; // s: room to start every source (and the first clicks) on the same sample
export const PEAKS_PER_SECOND = 200;

/** Linear resampling of `src` into `dst` (whose length sets the new rate). Enough here: the 128 kbps mp3s hold
 *  next to nothing above 16 kHz, so going down to 32 kHz leaves little to alias. */
export function resampleLinear(src: Float32Array, dst: Float32Array): void {
  const ratio = src.length / dst.length, last = src.length - 1;
  for (let i = 0; i < dst.length; i++) {
    const x = i * ratio, j = x | 0;
    dst[i] = j < last ? src[j] + (src[j + 1] - src[j]) * (x - j) : src[last];
  }
}

/** The loudest sample of each 1/perSecond s: the waveform the beat editor draws. */
export function computePeaks(data: Float32Array, sampleRate: number, perSecond = PEAKS_PER_SECOND): Float32Array {
  const size = sampleRate / perSecond;
  const peaks = new Float32Array(Math.ceil(data.length / size));
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i]), k = Math.floor(i / size);
    if (v > peaks[k]) peaks[k] = v;
  }
  return peaks;
}

export class MixEngine {
  songId: string | null = null;
  duration = 0;
  peaks: Float32Array | null = null;
  loading: { done: number; total: number } | null = null;
  playing = false;
  beats: Beat[] = [];
  tracks = Object.fromEntries(TRACKS.map((t) => [t, { on: true, volume: t === 'clicks' ? 0.8 : 1 }])) as Record<Track, TrackState>;

  private ctx: AudioContext | null = null;
  private decoder: OfflineAudioContext | null = null;
  private gains = new Map<Track, GainNode>();
  private buffers = new Map<Stem, AudioBuffer>();
  private sources: AudioBufferSourceNode[] = [];
  private blips: OscillatorNode[] = [];
  private offset = 0; // song time at `startedAt` (or where it is paused)
  private startedAt = 0; // context time
  private scheduledTo = 0; // song time up to which clicks are scheduled
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();
  private loadToken = 0;
  version = 0;

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  private emit() { this.version++; for (const fn of this.listeners) fn(); }

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'playback' });
      for (const t of TRACKS) {
        const g = this.ctx.createGain();
        g.connect(this.ctx.destination);
        this.gains.set(t, g);
        this.applyGain(t);
      }
    }
    return this.ctx;
  }

  /** The song time being heard now (the output latency taken off, so the playhead matches the sound). */
  get time(): number {
    if (!this.playing || !this.ctx) return this.offset;
    const latency = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    return Math.min(this.duration, Math.max(this.offset, this.offset + this.ctx.currentTime - this.startedAt - latency));
  }

  /** The song time the sources have reached (what the clicks are scheduled against). */
  private get sourceTime(): number {
    return this.playing && this.ctx ? this.offset + this.ctx.currentTime - this.startedAt : this.offset;
  }

  has(stem: Stem) { return this.buffers.has(stem); }

  /** Opens a song: its id is set at once (a second call for the same song can tell), the stems decoded after. */
  async load(songId: string, rows: Promise<StemRow[]>, beats: Beat[]): Promise<void> {
    this.unload();
    const token = ++this.loadToken;
    const ctx = this.context();
    this.songId = songId;
    this.beats = beats;
    const stems = await rows;
    if (token !== this.loadToken) return;
    const ordered = STEMS.map((s) => stems.find((r) => r.name === s)).filter((r): r is StemRow => !!r);
    this.loading = { done: 0, total: ordered.length };
    this.emit();
    for (let i = 0; i < ordered.length; i += DECODE_AT_ONCE) {
      await Promise.all(ordered.slice(i, i + DECODE_AT_ONCE).map(async (row) => {
        const buffer = await this.decode(ctx, row.blob);
        if (token !== this.loadToken) return; // another song was opened meanwhile
        this.buffers.set(row.name, buffer);
        this.duration = Math.max(this.duration, buffer.duration);
        this.loading = { done: (this.loading?.done ?? 0) + 1, total: ordered.length };
        this.emit();
      }));
      if (token !== this.loadToken) return;
    }
    const wave = this.buffers.get('drums') ?? this.buffers.values().next().value;
    this.peaks = wave ? computePeaks(wave.getChannelData(0), wave.sampleRate) : null;
    // drawn full height however loud the stem is
    const max = this.peaks?.reduce((m, v) => Math.max(m, v), 0) ?? 0;
    if (this.peaks && max > 0) this.peaks = this.peaks.map((v) => v / max);
    this.loading = null;
    this.emit();
  }

  /** A stem decoded at its own rate (no resampling by the browser) and brought to the context's rate. */
  private async decode(ctx: AudioContext, blob: Blob): Promise<AudioBuffer> {
    this.decoder ??= new OfflineAudioContext(1, 1, DECODE_RATE);
    const raw = await this.decoder.decodeAudioData(await blob.arrayBuffer());
    if (raw.sampleRate === ctx.sampleRate) return raw;
    const out = ctx.createBuffer(raw.numberOfChannels, Math.round(raw.duration * ctx.sampleRate), ctx.sampleRate);
    for (let c = 0; c < raw.numberOfChannels; c++) resampleLinear(raw.getChannelData(c), out.getChannelData(c));
    return out;
  }

  unload() {
    this.loadToken++;
    this.stop();
    this.buffers.clear();
    this.songId = null;
    this.duration = 0;
    this.offset = 0;
    this.peaks = null;
    this.loading = null;
    this.beats = [];
    this.emit();
  }

  play() {
    if (this.playing || !this.buffers.size || this.loading) return;
    if (this.offset >= this.duration - 0.05) this.offset = 0;
    void this.context().resume();
    this.start();
    this.emit();
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.sourceTime;
    this.stop();
    this.emit();
  }

  seek(t: number) {
    const to = Math.min(Math.max(0, t), this.duration);
    if (this.playing) {
      this.stop();
      this.offset = to;
      this.start();
    } else {
      this.offset = to;
    }
    this.emit();
  }

  setTrack(track: Track, patch: Partial<TrackState>) {
    this.tracks = { ...this.tracks, [track]: { ...this.tracks[track], ...patch } };
    this.applyGain(track);
    this.emit();
  }

  /** The steps the clicks follow: read at every tick, so an edit is heard as soon as it comes round. */
  setBeats(beats: Beat[]) { this.beats = beats; }

  private applyGain(track: Track) {
    const g = this.gains.get(track);
    if (!g || !this.ctx) return;
    const { on, volume } = this.tracks[track];
    g.gain.setTargetAtTime(on ? volume : 0, this.ctx.currentTime, 0.015); // no click on a switch
  }

  private start() {
    const ctx = this.context();
    this.startedAt = ctx.currentTime + START_DELAY;
    for (const [stem, buffer] of this.buffers) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.gains.get(stem)!);
      src.start(this.startedAt, Math.min(this.offset, buffer.duration));
      this.sources.push(src);
    }
    this.playing = true;
    this.scheduledTo = this.offset;
    this.tick();
  }

  private stop() {
    clearTimeout(this.timer);
    for (const s of this.sources) { try { s.stop(); } catch { /* not started */ } s.disconnect(); }
    for (const b of this.blips) { try { b.stop(); } catch { /* already over */ } }
    this.sources = [];
    this.blips = [];
    this.playing = false;
  }

  private tick = () => {
    const ctx = this.ctx!;
    const now = this.sourceTime;
    if (now >= this.duration) {
      this.stop();
      this.offset = this.duration;
      this.emit();
      return;
    }
    const to = now + LOOKAHEAD;
    for (const b of clicksInWindow(this.beats, this.scheduledTo, to)) {
      const when = this.startedAt + (b.t - this.offset);
      if (when >= ctx.currentTime) this.blips.push(playClick(ctx, this.gains.get('clicks')!, when, b.role as 1 | 2 | 3));
    }
    this.scheduledTo = Math.max(this.scheduledTo, to);
    if (this.blips.length > 32) this.blips = this.blips.slice(-16); // the old ones are over
    this.timer = setTimeout(this.tick, TICK_MS);
  };
}
