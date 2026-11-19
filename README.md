# Pico Forró

Multitrack player for learning forró: plays a song separated into stems, each stem on/off with its own
volume, with footwork clicks made live from the song's steps (`<song>_beats.json`), and a beat editor to fix
the steps and export the file. A music player too: playlists, search, auto-play of the next song.

## Song folders
One folder per song, its files named after the song, as a stem-separation tool (e.g. Demucs, six stems) and
a beat tracker write them:

```
My Song/
  My Song_vocals.mp3   My Song_guitar.mp3   My Song_piano.mp3
  My Song_bass.mp3     My Song_drums.mp3    My Song_other.mp3
  My Song_beats.json
  flac/                (optional, see Faster opening)
```

Any of the six stems can be missing. Other files (the full mix, a `_clicks.mp3`…) are left out: the stems add
up to the mix and the clicks are made from the beats file. A song id ending such as ` [AbC123xYz_0]` (as
yt-dlp names files) is dropped from the title shown. `_beats.json` needs four lists of times in seconds:
`steps` (every step) and `ones`, `twos`, `threes` (see Beats); any other field is kept as it is.

## Run
- `npm install` (once), `npm run dev`: the app in the browser.
- `npm test`, `npm run lint`, `npm run typecheck`.
- `./rebuild.sh`: build the Android APK and install it on a phone over USB (`--no-install` to only build;
  needs the Android SDK and JDK 21).
- `python3 scripts/make_icons.py`: redraw the icons and splash.
- `scripts/make_flac.sh <folder>`: the stems as FLAC, for faster opening (see Songs; needs ffmpeg).
- `server/`: the group server for shared tags (its own README).

## Songs
Add → **Open folder as playlist**: pick a song folder, or a folder of song folders (one level down, not
deeper). On Android the songs play from the folder, nothing copied: the app keeps Android's permission to read
it and fetches a song's stems when it is opened. If the folder is moved or renamed, open it again (or Re-scan
in the playlist's menu). Opening the same folder again updates its playlist. In the browser a folder can't be
read again later, so there its songs are imported.

Add → **Import files** copies a song into the app: select every file of one song folder (the stems and
`_beats.json`). Files of a song can come in several imports; they are merged, and beat edits are kept.

**Faster opening**: `scripts/make_flac.sh <folder>` (a song folder, or a folder of song folders; needs
ffmpeg) writes each song's stems as the app plays them, mono 32 kHz FLAC, into a `flac/` folder inside the
song folder; the mp3s stay as they are. A song with them opens about 2.5× faster and takes half the memory
(they stay in sync with the beats: same samples, to within one at 32 kHz). The app uses a stem's `.flac` over
its `.mp3` when both are there, so open the folder again (or Re-scan) after running it. Stems already made are
skipped.

## Playing
Tap a song to open it and play it; the list it was tapped in (as shown, search applied) is what comes next.
The song playing is marked in the lists, and the bar at the bottom plays/pauses it, skips to the next one,
or opens it. On the song page: ⏮ ⏭, **Repeat this song** and **Auto-play the next song** (both remembered).
The next song takes its decode time (a few seconds on a phone) before it starts.

## Tags and sharing
On a song's page, the button left of ☰ (a ballot, or ✓ / ⚠ once you reviewed; a dot when the group has votes
you haven't seen) or ☰ → **Rhythm & review…**, one tap each:
- its general **rhythm**: Forró · Arrasta-pé · Baião · Xaxado;
- **Looks right** or **Needs a fix**. With Needs a fix you can add what's wrong (Steps · Rhythm · Audio) and a note.

Tap a chosen tag again to clear it. Rhythm… in a song's ⋮ menu tags it without opening it. The lists show ✓ or ⚠
and the rhythm. The search finds the tags: "needs a fix", "looks right", "not checked", "no rhythm", a
rhythm, or words of a note. For now every song clicks like forró, whatever its rhythm.

**The group**: the app is for a group of friends. The first time it opens it asks for your name and the group's
code, and it only opens once the group's server (see `server/README.md`) takes the code. This needs the internet the
first time; after that the app works offline. If the code changes on the server, everyone is back at this screen
on their next sync. Library ⋮ → **Account**: change your name, or log out.

Your tags go to the server a moment after each change, and the group's tags come back, **blind**: on a song you see
how many voted, and the votes themselves only once you gave yours (the rhythm votes once you tagged its rhythm,
the reviews and their notes once you reviewed it). Nobody just follows the others, and wanting to see is a
reason to vote. The lists show each song's number of votes and reviews. No audio is sent.

## Beats
`steps` has four slots per cycle: one, two, three (the louder accent click) and a silent pause.
`ones`/`twos`/`threes` list the steps of each role; the pause slots are the steps in none of them.
**Editing**: ☰ → **Edit steps** on a song's page (back returns to the mix):
- Tap a step to select it, drag it to move it; **double-tap** it for its next count (1 → 2 → 3 → pause).
- **Long-press** the picture: a step right there. Long-press a step: a range from it (then tap its last step).
- **Pinch** to zoom (3, 6, 12 or 24 s on screen), in the mix too.
- **Range**: shift or stretch a run of steps (stretching fixes a passage whose tempo drifts), or **Repeat ×N**:
  the range's pattern copied N times after it, over the steps there, every k × its average gap (k steps), so a
  1·2·3·pause cycle repeats as such. The range then covers the whole repeated part: if the copies drift off the
  music, stretch it (drag its last step onto the music).
- **Mark 3s**: mark the threes by hand: tap the timeline where one falls (on a step: right on it), or **Tap 3**
  along with the music; tap a mark to take it back. Two marks a cycle apart give the cycle; **Fill from 3s** then
  puts whole cycles (pause · 1 · 2 · 3) between each two marks, evenly spaced so they land on the marks (a tempo
  that drifts is followed), over the steps there.
- Every change is one Undo step.

Edits are saved in the app automatically. **Export beats** writes `<song>_beats.json` with only `steps`,
`ones`, `twos` and `threes` changed (every other field kept as it was).
