/** The imported songs, in IndexedDB on the web and in the Android WebView alike (blobs stay on disk until read;
 *  no 45 MB base64 trips through the native bridge). */
import Dexie, { type EntityTable } from 'dexie';
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
}

export interface StemRow {
  songId: string;
  name: Stem;
  blob: Blob;
}

export const db = new Dexie('pico-forro') as Dexie & {
  songs: EntityTable<SongRow, 'id'>;
  stems: EntityTable<StemRow, 'songId'>;
};

db.version(1).stores({
  songs: 'id, title',
  stems: '[songId+name], songId',
});

export async function deleteSong(id: string): Promise<void> {
  await db.transaction('rw', db.songs, db.stems, async () => {
    await db.stems.where('songId').equals(id).delete();
    await db.songs.delete(id);
  });
}

export async function loadStems(id: string): Promise<StemRow[]> {
  return db.stems.where('songId').equals(id).toArray();
}

export async function saveEdits(id: string, beats: Beat[] | null): Promise<void> {
  await db.songs.update(id, { beatsEdited: beats, updatedAt: Date.now() });
}
