/** The edited steps as `<song>_beats.json` (the same version-2 file the beat script writes, other fields
 *  kept), shared on Android (to Drive, mail, a file manager…) or downloaded on the web. */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { type Beat, type BeatsFile, serialize } from '@/beats/model';
import type { SongRow } from '@/library/db';

/** The app's own plugin (android/…/CacheFilePlugin.java), not @capacitor/filesystem: that one stalls ~12 s on a
 *  phone with a failing SD card. */
const CacheFile = registerPlugin<{ write: (o: { name: string; text: string }) => Promise<{ uri: string }> }>('CacheFile');

const EMPTY: BeatsFile = { version: 2, steps: [], ones: [], twos: [], threes: [] };

export function beatsJson(song: SongRow, beats: Beat[]): string {
  return JSON.stringify(serialize(beats, song.beatsOriginal ?? EMPTY), null, 1);
}

export async function exportBeats(song: SongRow, beats: Beat[]): Promise<void> {
  const name = `${song.id}_beats.json`;
  const json = beatsJson(song, beats);
  if (Capacitor.isNativePlatform()) {
    const { uri } = await CacheFile.write({ name, text: json });
    await Share.share({ title: name, files: [uri] });
  } else {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
