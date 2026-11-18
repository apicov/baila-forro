/** Sharing the songs' tags (rhythm, review) with the group's server: each person's latest tags per song, sent a
 *  moment after a change, at start and when back online; then the group's tags come back, blind: a song's votes
 *  only once you gave yours (the server keeps them back until then), else just how many there are. */
import { useSyncExternalStore } from 'react';
import { db, tagsChanged } from './db';
import { songKey } from './importSongs';

export interface Sharing { server: string; name: string; code: string; device: string }
export interface SyncStatus { last: number | null; error: string | null; busy: boolean }
/** The group on one song (by its songKey). `rhythms` once you tagged its rhythm, `review` once you reviewed it. */
export interface GroupSong {
  rhythm_votes: number;
  reviews: number;
  rhythms?: Partial<Record<string, number>>;
  review?: { right: number; fix: number; reasons: Partial<Record<string, number>>; notes: { name: string; note: string; mine: boolean }[] };
}

const KEY = 'pico-forro.sharing';
const GROUP_KEY = 'pico-forro.group'; // the group's tags as last fetched: still shown offline
const DELAY_MS = 2000;
export const DEFAULT_SERVER = 'https://forro.apicov.xyz';

export function loadSharing(): Sharing {
  let saved: Partial<Sharing> = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Sharing>; } catch { /* none yet */ }
  const s = { server: DEFAULT_SERVER, name: '', code: '', device: '', ...saved };
  if (!s.device) {
    s.device = crypto.randomUUID(); // this phone, made once: a person's tags stay theirs if their name changes
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* kept for this run */ }
  }
  return s;
}

export function saveSharing(s: Sharing): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* kept for this run */ }
}

export const isSetUp = (s: Sharing) => !!(s.server.trim() && s.name.trim() && s.code.trim());

let status: SyncStatus = { last: null, error: null, busy: false };
const listeners = new Set<() => void>();
const setStatus = (patch: Partial<SyncStatus>) => { status = { ...status, ...patch }; listeners.forEach((f) => f()); };
export const useSyncStatus = () => useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => status);

let group: Record<string, GroupSong> = (() => {
  try { return (JSON.parse(localStorage.getItem(GROUP_KEY) ?? '{}') as { songs?: Record<string, GroupSong> }).songs ?? {}; } catch { return {}; }
})();
const groupListeners = new Set<() => void>();
/** The group's tags per song key, as last fetched. */
export const useGroup = () => useSyncExternalStore((f) => { groupListeners.add(f); return () => groupListeners.delete(f); }, () => group);

let running: Promise<number> | null = null;
let again = false;

/** Sends the tags changed since the last time (also just the name, if none: checks the code). Resolves with how
 *  many songs were sent; rejects with a message for people. */
export function syncNow(): Promise<number> {
  if (running) { again = true; return running; }
  running = send().finally(() => {
    running = null;
    if (again) { again = false; void syncNow().catch(() => undefined); }
  });
  return running;
}

async function send(): Promise<number> {
  const s = loadSharing();
  if (!isSetUp(s)) return 0;
  setStatus({ busy: true });
  try {
    const changed = (await db.songs.toArray()).filter((x) => (x.tagsAt ?? 0) > (x.syncedAt ?? 0));
    const tags = changed.map((x) => ({
      key: songKey(x.id), title: x.title, rhythm: x.rhythm ?? null, review: x.review ?? null, at: x.tagsAt!,
    }));
    let res: Response;
    try {
      res = await fetch(`${s.server.trim().replace(/\/+$/, '')}/api/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Group-Code': s.code.trim() },
        body: JSON.stringify({ device: s.device, name: s.name.trim(), tags }),
      });
    } catch {
      throw new Error("Can't reach the server (no connection, or a wrong address).");
    }
    if (res.status === 401) throw new Error('Wrong group code.');
    if (!res.ok) throw new Error(`The server answered ${res.status}.`);
    for (const x of changed) await db.songs.update(x.id, { syncedAt: x.tagsAt });
    await fetchGroup(s);
    setStatus({ last: Date.now(), error: null });
    return changed.length;
  } catch (err) {
    setStatus({ error: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    setStatus({ busy: false });
  }
}

async function fetchGroup(s: Sharing): Promise<void> {
  const res = await fetch(`${s.server.trim().replace(/\/+$/, '')}/api/songs`, {
    headers: { 'X-Group-Code': s.code.trim(), 'X-Device': s.device },
  });
  if (!res.ok) throw new Error(`The server answered ${res.status}.`);
  group = ((await res.json()) as { songs?: Record<string, GroupSong> }).songs ?? {};
  try { localStorage.setItem(GROUP_KEY, JSON.stringify({ songs: group })); } catch { /* kept for this run */ }
  groupListeners.forEach((f) => f());
}

/** Shares a moment after each tag change, at start and when the phone is back online. */
export function startSync(): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow().catch(() => undefined), DELAY_MS);
  };
  tagsChanged.add(soon);
  window.addEventListener('online', soon);
  soon();
}

/** Shares and fetches the group's tags soon (a song page opened: its votes as fresh as can be). */
export function refreshSoon(): void {
  void syncNow().catch(() => undefined);
}
