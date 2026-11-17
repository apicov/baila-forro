/** What plays after what: the list a song was started from (as it was shown then), auto-play of the next song
 *  and repeat of the same one. It opens songs into the engine itself, so the next song starts wherever the user
 *  is (the library, a playlist, the song page). */
import { useSyncExternalStore } from 'react';
import { db, loadStems, type SongRow } from '@/library/db';
import { songBeats } from '@/beats/useBeatEdits';
import { engine } from './useEngine';

export interface PlayerSettings { autoNext: boolean; repeatOne: boolean }

/** The song to play when `current` ends: itself again, the next one in the queue, or none. */
export function afterEnd(queue: string[], current: string | null, s: PlayerSettings): string | null {
  if (current === null) return null;
  if (s.repeatOne) return current;
  if (!s.autoNext) return null;
  const i = queue.indexOf(current);
  return i >= 0 && i + 1 < queue.length ? queue[i + 1] : null;
}

const SAVED = 'pico-forro.player';

interface Saved extends PlayerSettings { queue: string[]; from: { label: string; path: string } }

function readSaved(): Saved {
  const none: Saved = { autoNext: true, repeatOne: false, queue: [], from: { label: 'Library', path: '/' } };
  try { return { ...none, ...(JSON.parse(localStorage.getItem(SAVED) ?? '{}') as Partial<Saved>) }; } catch { return none; }
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
      const next = afterEnd(this.queue, engine.songId, this.saved);
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

  /** Plays `song`, with `queue` (song ids) as what comes next. */
  play(song: SongRow, queue: string[], from: { label: string; path: string }) {
    this.change({ queue, from });
    this.open(song, true);
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
    const i = engine.songId === null ? -1 : this.queue.indexOf(engine.songId);
    return i >= 0 ? this.queue[i + step] ?? null : null;
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
