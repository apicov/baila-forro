/** What plays after what: the list a song was started from (as it was shown then, or shuffled), auto-play of the
 *  next song and repeat of the same one. It opens songs into the engine itself, so the next song starts wherever the user
 *  is (the library, a playlist, the song page). */
import { useSyncExternalStore } from 'react';
import { db, loadStems, type SongRow } from '@/library/db';
import { songBeats } from '@/beats/useBeatEdits';
import { engine } from './useEngine';

export interface PlayerSettings { autoNext: boolean; repeatOne: boolean }

/** The order the queue plays in: as shown, or shuffled with `first` (the song started or playing) first, so each
 *  song comes once per round. */
export function playOrder(queue: string[], first: string | null, shuffle: boolean, random: () => number = Math.random): string[] {
  if (!shuffle) return queue;
  const rest = queue.filter((id) => id !== first);
  for (let i = rest.length - 1; i > 0; i--) { // Fisher–Yates
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return first !== null && queue.includes(first) ? [first, ...rest] : rest;
}

/** The song to play when `current` ends: itself again, the next one in the queue, or none. */
export function afterEnd(queue: string[], current: string | null, s: PlayerSettings): string | null {
  if (current === null) return null;
  if (s.repeatOne) return current;
  if (!s.autoNext) return null;
  const i = queue.indexOf(current);
  return i >= 0 && i + 1 < queue.length ? queue[i + 1] : null;
}

const SAVED = 'pico-forro.player';

interface Saved extends PlayerSettings {
  queue: string[]; // the list as shown
  order: string[]; // what plays after what: the queue, or shuffled
  shuffle: boolean;
  from: { label: string; path: string };
}

function readSaved(): Saved {
  const none: Saved = { autoNext: true, repeatOne: false, queue: [], order: [], shuffle: false, from: { label: 'Library', path: '/' } };
  try {
    const s = { ...none, ...(JSON.parse(localStorage.getItem(SAVED) ?? '{}') as Partial<Saved>) };
    return s.order.length ? s : { ...s, order: s.queue }; // saved before shuffle existed
  } catch { return none; }
}

class Player {
  private saved = readSaved();
  private listeners = new Set<() => void>();
  private playWhenLoaded: string | null = null;
  version = 0;
  /** The last song that failed to open, and why. */
  error: { songId: string; message: string } | null = null;

  constructor() {
    engine.onEnded = () => {
      const next = afterEnd(this.saved.order, engine.songId, this.saved);
      if (next === engine.songId) engine.play(); // from the start again
      else if (next) void this.openId(next, true);
    };
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  private change(patch: Partial<Saved> = {}) {
    this.saved = { ...this.saved, ...patch };
    try { localStorage.setItem(SAVED, JSON.stringify(this.saved)); } catch { /* kept for this session only */ }
    this.version++;
    for (const fn of this.listeners) fn();
  }

  get queue() { return this.saved.queue; }
  get from() { return this.saved.from; }
  get autoNext() { return this.saved.autoNext; }
  get repeatOne() { return this.saved.repeatOne; }
  setAutoNext(v: boolean) { this.change({ autoNext: v }); }
  setRepeatOne(v: boolean) { this.change({ repeatOne: v }); }
  get shuffle() { return this.saved.shuffle; }
  /** Shuffle on: the rest of the list in a new random order after the song playing; off: back to the list as shown. */
  setShuffle(v: boolean) { this.change({ shuffle: v, order: playOrder(this.queue, engine.songId, v) }); }

  /** Plays `song`, with `queue` (song ids) as what comes next (shuffled, with shuffle on). */
  play(song: SongRow, queue: string[], from: { label: string; path: string }) {
    this.change({ queue, from, order: playOrder(queue, song.id, this.saved.shuffle) });
    this.open(song, true);
  }

  /** Shuffle on, and a random song of `queue` first; resolves with that song's id. */
  async shufflePlay(queue: string[], from: { label: string; path: string }): Promise<string | null> {
    const first = queue[Math.floor(Math.random() * queue.length)];
    const song = first ? await db.songs.get(first) : undefined;
    if (!song) return null;
    this.change({ shuffle: true });
    this.play(song, queue, from);
    return song.id;
  }

  /** Opens `song` (if it isn't open already), and plays it once its stems are decoded if `play`. */
  open(song: SongRow, play: boolean) {
    if (play) this.playWhenLoaded = song.id;
    if (engine.songId === song.id) {
      if (play && !engine.loading && !engine.playing) { this.playWhenLoaded = null; engine.play(); }
      return;
    }
    if (this.error) { this.error = null; this.change(); }
    if (!play) this.playWhenLoaded = null;
    engine.load(song.id, loadStems(song), songBeats(song)).then(() => {
      if (engine.songId !== song.id || engine.loading || this.playWhenLoaded !== song.id) return;
      this.playWhenLoaded = null;
      engine.play();
    }).catch((err: unknown) => {
      this.error = { songId: song.id, message: err instanceof Error ? err.message : String(err) };
      this.change();
    });
  }

  private async openId(id: string, play: boolean) {
    const song = await db.songs.get(id);
    if (song) this.open(song, play);
  }

  private neighbour(step: 1 | -1): string | null {
    const order = this.saved.order;
    const i = engine.songId === null ? -1 : order.indexOf(engine.songId);
    return i >= 0 ? order[i + step] ?? null : null;
  }
  get hasNext() { return this.neighbour(1) !== null; }
  get hasPrev() { return this.neighbour(-1) !== null; }

  next() { const id = this.neighbour(1); if (id) void this.openId(id, true); }
  /** The previous song, or this one from the start when it is the first. */
  prev() {
    const id = this.neighbour(-1);
    if (id) void this.openId(id, true);
    else engine.seek(0);
  }
}

export const player = new Player();

/** The player, re-rendering on its changes (queue, settings, an error). */
export function usePlayer(): Player {
  useSyncExternalStore(player.subscribe, player.getVersion);
  return player;
}
