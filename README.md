# Pico Forró

Multitrack player for the separated forró songs in `forro_music/`: each stem on/off with its own volume,
footwork clicks made live from `<song>_beats.json`, and a beat editor to fix the steps and export the file.

## Run
- `npm install` (once), `npm run dev`: the app in the browser.
- `npm test`, `npm run lint`, `npm run typecheck`.
- `./rebuild.sh`: build the Android APK and install it on the phone over USB (`--no-install` to only build).
- `python3 scripts/make_icons.py`: redraw the icons and splash.

## Songs
Import → select every file of one song folder (the Android picker can't pick a folder). The app keeps
the six stems (`_vocals _guitar _piano _bass _drums _other.mp3`) and `_beats.json`; it skips the full mix and
`_clicks.mp3`, because the stems add up to the mix and the clicks are made from the beats file. Files of a
song can come in several imports; they are merged, and beat edits are kept.

## Beats
`steps` has four slots per cycle: one, two, three (the louder accent click) and a silent pause.
`ones`/`twos`/`threes` list the steps of each role; the pause slots are the steps in none of them.
Edits save on the phone automatically. **Export beats** writes `<song>_beats.json` with only `steps`,
`ones`, `twos` and `threes` changed (every other field kept as it was).
