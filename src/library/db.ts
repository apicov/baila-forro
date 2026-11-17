/** The imported songs, in IndexedDB on the web and in the Android WebView alike (blobs stay on disk until read;
 *  no 45 MB base64 trips through the native bridge). */
import Dexie, { type EntityTable } from 'dexie';
import { Capacitor } from '@capacitor/core';
import type { Beat, BeatsFile } from '@/beats/model';

export const STEMS = ['vocals', 'guitar', 'piano', 'bass', 'drums', 'other'] as const;
export type Stem = (typeof STEMS)[number];

export interface SongRow {
  id: string; // the file name before `_<stem>.mp3`
  title: string;
  stems: Stem[]; // the ones imported, in STEMS order
  beatsOriginal: BeatsFile | null;
  beatsEdited: Beat[] | null; // the user's edits; null: as in the original
  updatedAt: number;
  /** A song played from a folder (nothing copied): its stems' content URIs, read when the song is opened. */
  files?: Partial<Record<Stem, string>>;
}

export interface PlaylistRow {
  id?: number;
  name: string;
  songIds: string[];
  tree?: string; // the folder it was opened from (Android's tree URI)
}

export interface StemRow {
  songId: string;
  name: Stem;
  blob: Blob;
}

export const db = new Dexie('pico-forro') as Dexie & {
  songs: EntityTable<SongRow, 'id'>;
  stems: EntityTable<StemRow, 'songId'>;
  playlists: EntityTable<PlaylistRow, 'id'>;
};

db.version(1).stores({
  songs: 'id, title',
  stems: '[songId+name], songId',
});
db.version(2).stores({
  playlists: '++id, name, tree',
});

export async function deleteSong(id: string): Promise<void> {
  await db.transaction('rw', db.songs, db.stems, db.playlists, async () => {
    await db.stems.where('songId').equals(id).delete();
    await db.songs.delete(id);
    await db.playlists.toCollection().modify((p) => { p.songIds = p.songIds.filter((s) => s !== id); });
  });
}

/** A song's stems: the copies in the app first, then the ones read from its folder. Each folder file is fetched
 *  whole: the local server's range answers start from byte 0 whatever was asked. */
export async function loadStems(song: SongRow): Promise<StemRow[]> {
  const copied = await db.stems.where('songId').equals(song.id).toArray();
  const fromFolder = Object.entries(song.files ?? {}).filter(([name]) => !copied.some((r) => r.name === name));
  const read = await Promise.all(fromFolder.map(async ([name, uri]) => {
    let res: Response;
    try { res = await fetch(Capacitor.convertFileSrc(uri)); } catch { res = Response.error(); }
    if (!res.ok) throw new Error(`can't read its ${name} file: the folder may have moved or been renamed. Open it again.`);
    return { songId: song.id, name: name as Stem, blob: await res.blob() };
  }));
  return [...copied, ...read];
}

export async function saveEdits(id: string, beats: Beat[] | null): Promise<void> {
  await db.songs.update(id, { beatsEdited: beats, updatedAt: Date.now() });
}
