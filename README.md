# Pico Forró

Multitrack player for the separated forró songs in `forro_music/`: each stem on/off with its own volume,
footwork clicks made live from `<song>_beats.json`, and a beat editor to fix the steps and export the file.

## Run
- `npm install` (once), `npm run dev`: the app in the browser.
- `npm test`, `npm run lint`, `npm run typecheck`.
- `./rebuild.sh`: build the Android APK and install it on the phone over USB (`--no-install` to only build).
- `python3 scripts/make_icons.py`: redraw the icons and splash.

## Songs
Add → **Open folder as playlist**: pick a song folder, or a folder of song folders (one level down, not
deeper). On Android the songs play from the folder, nothing copied: the app keeps Android's permission to read
it and fetches a song's stems when it is opened. If the folder is moved or renamed, open it again (or Re-scan
in the playlist's menu). Opening the same folder again updates its playlist. In the browser a folder can't be
read again later, so there its songs are imported.

Add → **Import files** copies a song into the app: select every file of one song folder. The app keeps
the six stems (`_vocals _guitar _piano _bass _drums _other.mp3`) and `_beats.json`; it skips the full mix and
`_clicks.mp3`, because the stems add up to the mix and the clicks are made from the beats file. Files of a
song can come in several imports; they are merged, and beat edits are kept.

## Playing
Tap a song to open it and play it; the list it was tapped in (as shown, search applied) is what comes next.
The song playing is marked in the lists, and the bar at the bottom plays/pauses it, skips to the next one,
or opens it. On the song page: ⏮ ⏭, **Repeat this song** and **Auto-play the next song** (both remembered).
The next song takes its decode time (a few seconds on the phone) before it starts.

## Beats
`steps` has four slots per cycle: one, two, three (the louder accent click) and a silent pause.
`ones`/`twos`/`threes` list the steps of each role; the pause slots are the steps in none of them.
Edits save on the phone automatically. **Export beats** writes `<song>_beats.json` with only `steps`,
`ones`, `twos` and `threes` changed (every other field kept as it was).
