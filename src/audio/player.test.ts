import { afterEnd, playOrder } from './player';
import { folderName, matches } from '@/library/search';
import { groupFiles } from '@/library/importSongs';

describe('afterEnd', () => {
  const q = ['a', 'b', 'c'];
  it('plays the next song of the queue with auto-play on', () => {
    expect(afterEnd(q, 'a', { autoNext: true, repeatOne: false })).toBe('b');
  });
  it('stops at the end of the queue, or with auto-play off', () => {
    expect(afterEnd(q, 'c', { autoNext: true, repeatOne: false })).toBeNull();
    expect(afterEnd(q, 'a', { autoNext: false, repeatOne: false })).toBeNull();
    expect(afterEnd(q, 'x', { autoNext: true, repeatOne: false })).toBeNull(); // not from this list
  });
  it('repeats the same song, whatever auto-play says', () => {
    expect(afterEnd(q, 'b', { autoNext: true, repeatOne: true })).toBe('b');
    expect(afterEnd(q, 'c', { autoNext: false, repeatOne: true })).toBe('c');
  });
});

describe('search', () => {
  it('ignores case and accents, also decomposed ones', () => {
    expect(matches('Forró do Menino', 'forro')).toBe(true);
    expect(matches('Forró do Menino', 'FORRÓ')).toBe(true);
    expect(matches('A Barca', ' barca ')).toBe(true);
    expect(matches('A Barca', 'lilith')).toBe(false);
  });
  it('names a folder from its tree URI', () => {
    expect(folderName('content://com.android.externalstorage.documents/tree/primary%3AMusic%2Fforro_music')).toBe('forro_music');
    expect(folderName('content://com.android.externalstorage.documents/tree/1234-5678%3Aforro')).toBe('forro');
  });
});

describe('groupFiles', () => {
  it('groups folder entries (name + uri) like files', () => {
    const songs = groupFiles([
      { name: 'Song [abcdefghijk]_bass.mp3', uri: 'u1' }, { name: 'Song [abcdefghijk]_beats.json', uri: 'u2' },
      { name: 'Song [abcdefghijk]_clicks.mp3', uri: 'u3' }, { name: 'notes.txt', uri: 'u4' },
    ]);
    expect(songs).toHaveLength(1);
    expect(songs[0].title).toBe('Song');
    expect(songs[0].stems.bass?.uri).toBe('u1');
    expect(songs[0].beats?.uri).toBe('u2');
  });
  it('takes a stem\'s .flac over its .mp3, whichever comes first', () => {
    const a = groupFiles([{ name: 'S_bass.mp3', uri: 'm' }, { name: 'S_bass.flac', uri: 'f' }, { name: 'S_drums.mp3', uri: 'd' }]);
    const b = groupFiles([{ name: 'S_bass.flac', uri: 'f' }, { name: 'S_bass.mp3', uri: 'm' }]);
    expect(a[0].stems.bass?.uri).toBe('f');
    expect(a[0].stems.drums?.uri).toBe('d');
    expect(b[0].stems.bass?.uri).toBe('f');
  });
});

describe('playOrder', () => {
  const q = ['a', 'b', 'c', 'd', 'e'];
  it('is the list as shown with shuffle off', () => {
    expect(playOrder(q, 'c', false)).toBe(q);
  });
  it('shuffled: the first song first, every song once', () => {
    for (let k = 0; k < 20; k++) {
      const o = playOrder(q, 'c', true);
      expect(o[0]).toBe('c');
      expect([...o].sort()).toEqual(q);
    }
  });
  it('really shuffles (a fixed random: a fixed order, not the list)', () => {
    let x = 0.3;
    const random = () => (x = (x * 9301 + 49297) % 233280 / 233280);
    const o = playOrder(q, 'a', true, random);
    expect(o).not.toEqual(q);
    expect(playOrder(q, 'a', true, (() => { let y = 0.3; return () => (y = (y * 9301 + 49297) % 233280 / 233280); })())).toEqual(o);
  });
  it('without a first song in the list, just the shuffled list', () => {
    expect([...playOrder(q, 'x', true)].sort()).toEqual(q);
  });
});
