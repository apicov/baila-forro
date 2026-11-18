import 'fake-indexeddb/auto';
import { vi } from 'vitest';
import { db, setTags, type SongRow } from './db';
import { songKey } from './importSongs';
import { matches } from './search';
import { searchText } from './tags';
import { renderHook } from '@testing-library/react';
import { saveSharing, syncNow, useGroup } from './sync';

const song = (id: string, extra: Partial<SongRow> = {}): SongRow => ({
  id, title: id.replace(/ \[.*$/, ''), stems: [], beatsOriginal: null, beatsEdited: null, updatedAt: 0, ...extra,
});

describe('songKey', () => {
  it('is the YouTube id at the end of the name, in either form', () => {
    expect(songKey('Alcalyno - Lilith (Forró Stream) [L182VmVf9ao]')).toBe('yt:L182VmVf9ao');
    expect(songKey('Alcalyno - Pão de Queijo e Forró (Forró Stream)-PLASbu0A4UY')).toBe('yt:PLASbu0A4UY');
  });
  it('is the folded title without one', () => {
    expect(songKey('Pão de Queijo')).toBe('title:pao de queijo');
    expect(songKey('Pão de Queijo'.normalize('NFD'))).toBe('title:pao de queijo');
  });
});

describe('search on tags', () => {
  const fix = song('A', { rhythm: 'arrasta-pé', review: { verdict: 'fix', reasons: ['steps'], note: 'late from 2:10' } });
  const right = song('B', { rhythm: 'forró', review: { verdict: 'right', reasons: [], note: '' } });
  const none = song('C');
  const find = (q: string) => [fix, right, none].filter((s) => matches(searchText(s), q)).map((s) => s.id);
  it('finds rhythms, reviews, reasons, notes and what is not tagged yet', () => {
    expect(find('arrasta')).toEqual(['A']);
    expect(find('needs a fix')).toEqual(['A']);
    expect(find('looks right')).toEqual(['B']);
    expect(find('not checked')).toEqual(['C']);
    expect(find('no rhythm')).toEqual(['C']);
    expect(find('steps')).toEqual(['A']);
    expect(find('2:10')).toEqual(['A']);
  });
});

describe('sync', () => {
  beforeEach(async () => {
    await db.songs.clear();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends only the songs whose tags changed, once, then marks them shared', async () => {
    await db.songs.bulkPut([song('Lilith [L182VmVf9ao]'), song('Untagged')]);
    await setTags('Lilith [L182VmVf9ao]', { rhythm: 'xaxado' });
    saveSharing({ server: 'https://srv.test/', name: 'Ana', code: 'abc', device: 'dev-1' });
    const groupView = { songs: { 'yt:L182VmVf9ao': { rhythm_votes: 2, reviews: 0, rhythms: { 'xaxado': 1, 'forró': 1 } } } };
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/api/songs') ? groupView : { ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await syncNow()).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://srv.test/api/tags');
    expect((init.headers as Record<string, string>)['X-Group-Code']).toBe('abc');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ device: 'dev-1', name: 'Ana' });
    expect(body.tags).toEqual([{ key: 'yt:L182VmVf9ao', title: 'Lilith', rhythm: 'xaxado', review: null, at: expect.any(Number) }]);

    // then the group's view, asked as this device (the server shows a song's votes only to those who gave theirs)
    const [groupUrl, groupInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(groupUrl).toBe('https://srv.test/api/songs');
    expect(groupInit.headers).toMatchObject({ 'X-Group-Code': 'abc', 'X-Device': 'dev-1' });
    expect(renderHook(() => useGroup()).result.current['yt:L182VmVf9ao'].rhythms).toEqual({ 'xaxado': 1, 'forró': 1 });
    expect(JSON.parse(localStorage.getItem('pico-forro.group')!).songs['yt:L182VmVf9ao'].rhythm_votes).toBe(2); // kept for offline

    expect(await syncNow()).toBe(0); // nothing new: only the name goes (checks the code)
    expect(JSON.parse((fetchMock.mock.calls[2] as unknown as [string, RequestInit])[1].body as string).tags).toEqual([]);
  });

  it('keeps the tags to send when the code is wrong or the server is away', async () => {
    await db.songs.put(song('S'));
    await setTags('S', { review: { verdict: 'right', reasons: [], note: '' } });
    saveSharing({ server: 'https://srv.test', name: 'Ana', code: 'bad', device: 'd' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    await expect(syncNow()).rejects.toThrow('Wrong group code.');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(syncNow()).rejects.toThrow("Can't reach the server");
    expect((await db.songs.get('S'))!.syncedAt).toBeUndefined();
  });

  it('does nothing until the name and code are filled in', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await syncNow()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
