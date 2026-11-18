/** "Open folder as playlist". On Android the songs stay in the folder (the app keeps Android's permission to
 *  read it and fetches a song's stems when it is opened); the playlist is named after the folder, and opening
 *  the same folder again updates it. In the browser a folder can't be read again later, so its songs are
 *  imported (copied) as with Import. */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BeatsFile } from '@/beats/model';
import { db, STEMS, type SongRow, type Stem } from './db';
import { groupFiles, importSongs } from './importSongs';
import { folderName } from './search';

interface Entry { name: string; uri: string }
interface Listing { tree: string | null; files?: Entry[] }

const FolderPicker = registerPlugin<{
  pick: () => Promise<Listing>;
  list: (o: { tree: string }) => Promise<Listing>;
}>('FolderPicker');

export const canPickFolder = Capacitor.isNativePlatform();

export interface Opened { playlistId: number; name: string; songs: number }

/** Android's folder picker; null if the user backed out. */
export async function pickFolder(): Promise<Opened | null> {
  const listing = await FolderPicker.pick();
  return listing.tree ? savePlaylist(listing.tree, listing.files ?? []) : null;
}

/** Reads a folder playlist's folder again (songs added or removed there). */
export async function rescanFolder(tree: string): Promise<Opened> {
  return savePlaylist(tree, (await FolderPicker.list({ tree })).files ?? []);
}

async function savePlaylist(tree: string, files: Entry[]): Promise<Opened> {
  const picked = groupFiles(files);
  const ids: string[] = [];
  for (const p of picked) {
    let beats: BeatsFile | null = null;
    if (p.beats) {
      const res = await fetch(Capacitor.convertFileSrc(p.beats.uri));
      if (res.ok) beats = (await res.json()) as BeatsFile;
    }
    const uris = Object.fromEntries(Object.entries(p.stems).map(([s, e]) => [s, e.uri])) as Partial<Record<Stem, string>>;
    await db.transaction('rw', db.songs, async () => {
      const old = await db.songs.get(p.id);
      const stems = new Set([...(old?.stems ?? []), ...(Object.keys(uris) as Stem[])]);
      const row: SongRow = {
        ...old, // its tags
        id: p.id,
        title: p.title,
        stems: STEMS.filter((s) => stems.has(s)),
        beatsOriginal: beats ?? old?.beatsOriginal ?? null,
        beatsEdited: old?.beatsEdited ?? null, // the user's edits stay
        updatedAt: Date.now(),
        files: uris,
      };
      await db.songs.put(row);
    });
    ids.push(p.id);
  }
  return upsertPlaylist(folderName(tree), ids, picked, tree);
}

/** The browser's folder input: the songs are imported, the playlist named after the folder picked. */
export async function importFolder(files: File[]): Promise<Opened | null> {
  const picked = await importSongs(files);
  if (!picked.length) return null;
  const name = files[0].webkitRelativePath.split('/')[0] || 'Folder';
  return upsertPlaylist(name, picked.map((p) => p.id), picked);
}

async function upsertPlaylist(name: string, ids: string[], picked: { id: string; title: string }[], tree?: string): Promise<Opened> {
  const title = new Map(picked.map((p) => [p.id, p.title]));
  const songIds = [...ids].sort((a, b) => title.get(a)!.localeCompare(title.get(b)!));
  const old = tree ? await db.playlists.where('tree').equals(tree).first() : undefined;
  let playlistId = old?.id;
  if (playlistId !== undefined) await db.playlists.update(playlistId, { songIds });
  else playlistId = (await db.playlists.add({ name, songIds, tree }))!;
  return { playlistId, name: old?.name ?? name, songs: songIds.length };
}
