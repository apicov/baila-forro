/** Songs from picked files: `<song>_<stem>.mp3` and `<song>_beats.json`, as the separation script writes
 *  them. The Android file picker can't pick a folder, so the user selects every file of a song folder; files
 *  of several songs can come in one go, and a song can come in several goes (they are merged). */
import { db, STEMS, type Stem, type SongRow } from './db';
import type { BeatsFile } from '@/beats/model';

export interface PickedSong {
  id: string;
  title: string;
  stems: Partial<Record<Stem, File>>;
  beats?: File;
}

const STEM_FILE = new RegExp(`^(.*)_(${STEMS.join('|')})\\.mp3$`, 'i');
const BEATS_FILE = /^(.*)_beats\.json$/i;

/** "Alcalyno - Lilith (Forró Stream) [L182VmVf9ao]" → "Alcalyno - Lilith" (also a "-<id>" ending). */
export function songTitle(base: string): string {
  return base
    .replace(/(\s*\[[\w-]{11}\]|-[\w-]{11})$/, '')
    .replace(/\s*\(Forró Stream\)/i, '')
    .trim();
}

/** Groups the files by song. The full mix and `_clicks.mp3` are left out: the stems add up to the mix, and the
 *  clicks are made live from the beats file. Names are NFC-normalized: the files come with decomposed
 *  accents (o + ´), the same song must group the same however they were written. */
export function groupFiles(files: File[]): PickedSong[] {
  const songs = new Map<string, PickedSong>();
  const song = (base: string) => {
    let s = songs.get(base);
    if (!s) songs.set(base, (s = { id: base, title: songTitle(base), stems: {} }));
    return s;
  };
  for (const file of files) {
    const name = file.name.normalize('NFC');
    const stem = STEM_FILE.exec(name);
    const beats = BEATS_FILE.exec(name);
    if (stem) song(stem[1]).stems[stem[2].toLowerCase() as Stem] = file;
    else if (beats) song(beats[1]).beats = file;
  }
  return [...songs.values()];
}

/** Saves the picked songs (merged into ones already there; the user's beat edits are kept). */
export async function importSongs(files: File[]): Promise<PickedSong[]> {
  const picked = groupFiles(files);
  for (const p of picked) {
    const beatsOriginal = p.beats ? (JSON.parse(await p.beats.text()) as BeatsFile) : undefined;
    await db.transaction('rw', db.songs, db.stems, async () => {
      const old = await db.songs.get(p.id);
      const stems = [...new Set([...(old?.stems ?? []), ...(Object.keys(p.stems) as Stem[])])];
      const row: SongRow = {
        id: p.id,
        title: p.title,
        stems: STEMS.filter((s) => stems.includes(s)),
        beatsOriginal: beatsOriginal ?? old?.beatsOriginal ?? null,
        beatsEdited: old?.beatsEdited ?? null,
        updatedAt: Date.now(),
      };
      await db.songs.put(row);
      for (const [name, file] of Object.entries(p.stems)) {
        await db.stems.put({ songId: p.id, name: name as Stem, blob: file });
      }
    });
  }
  return picked;
}
