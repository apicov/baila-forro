import 'fake-indexeddb/auto';
import { db, loadStems } from './db';
import { groupFiles, importSongs, songTitle } from './importSongs';

const file = (name: string, body = 'x') => new File([body], name);
// as they come off the disk: decomposed accents (o + U+0301)
const NFD = 'Alcalyno - Medéia (Forró Stream) [AmiebS3SJqI]'.normalize('NFD');

describe('groupFiles', () => {
  it('groups a song folder by name and maps the stems', () => {
    const [song, ...rest] = groupFiles([
      file(`${NFD}_bass.mp3`), file(`${NFD}_drums.mp3`), file(`${NFD}_beats.json`),
      file(`${NFD}.mp3`), file(`${NFD}_clicks.mp3`), file('notes.txt'),
    ]);
    expect(rest).toEqual([]);
    expect(song.id).toBe('Alcalyno - Medéia (Forró Stream) [AmiebS3SJqI]'.normalize('NFC'));
    expect(song.title).toBe('Alcalyno - Medéia');
    expect(Object.keys(song.stems).sort()).toEqual(['bass', 'drums']);
    expect(song.beats?.name).toContain('_beats.json');
  });

  it('keeps two songs apart, however their accents were written', () => {
    const nfc = NFD.normalize('NFC');
    const songs = groupFiles([file(`${NFD}_bass.mp3`), file(`${nfc}_vocals.mp3`), file('Other Song_bass.mp3')]);
    expect(songs.map((s) => Object.keys(s.stems).length)).toEqual([2, 1]);
  });

  it('cleans the title', () => {
    expect(songTitle('Alcalyno - Pão de Queijo e Forró (Forró Stream)-PLASbu0A4UY')).toBe('Alcalyno - Pão de Queijo e Forró');
    expect(songTitle('A Barca - Dona Mariquinha (Forró Stream) [Xt7enAPvPm4]')).toBe('A Barca - Dona Mariquinha');
    expect(songTitle('Plain Song')).toBe('Plain Song');
  });
});

describe('importSongs', () => {
  beforeEach(async () => { await db.songs.clear(); await db.stems.clear(); });

  it('saves the song and merges a later import, keeping the edits', async () => {
    const beats = JSON.stringify({ steps: [1], ones: [1], twos: [], threes: [] });
    await importSongs([file(`${NFD}_bass.mp3`), file(`${NFD}_beats.json`, beats)]);
    const id = NFD.normalize('NFC');
    await db.songs.update(id, { beatsEdited: [{ t: 2, role: 1 }] });

    await importSongs([file(`${NFD}_drums.mp3`)]);
    const song = await db.songs.get(id);
    expect(song?.stems).toEqual(['bass', 'drums']);
    expect(song?.beatsOriginal?.steps).toEqual([1]);
    expect(song?.beatsEdited).toEqual([{ t: 2, role: 1 }]);
    expect((await loadStems((await db.songs.get(id))!)).map((s) => s.name).sort()).toEqual(['bass', 'drums']);
  });
});
