"""A folder of songs for the app, from a Click Check list: each listed song's stems as the app plays them
(mono 32 kHz FLAC, as make_flac.sh) and its beats file, under a clean name: the singer and the song only.

    python3 scripts/make_song_set.py <list.txt> <stems folder> <new folder> [--dry-run]

<list.txt>: Click Check's approved.txt (lines "0.47 - <song>.mp3"). <stems folder>: one folder per song, named
<song>, holding <song>_<stem>.mp3 and <song>_beats.json. Each song gets <new folder>/<Name>/ with
<Name>_<stem>.flac, <Name>_beats.json and <Name>_info.json (the YouTube id, the original name and the Click Check
score, which leave the name). Songs already made are skipped, so it can be run again. Needs ffmpeg.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

STEMS = ["vocals", "guitar", "piano", "bass", "drums", "other"]
YOUTUBE_ID = re.compile(r"(?:\s*\[([\w-]{11})\]|-([\w-]{11}))$")

# names the rules can't tell: an album or a version in the name
OVERRIDES = {
    "Falamansa - Forró de Tamanco - Forró de Sangue Novo": "Falamansa - Forró de Tamanco",
}


def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def clean_name(base: str) -> str:
    """The singer and the song: no YouTube id, no "(Forró Stream)", no live/remaster/processing notes."""
    s = YOUTUBE_ID.sub("", nfc(base))
    s = OVERRIDES.get(s, s)
    s = re.sub(r"\s*\(For+ó Stream\)", "", s, flags=re.I)
    s = re.sub(r"\s*\[(no end|gap \d+ ?ms)\]", "", s, flags=re.I)  # notes from the processing
    s = re.sub(r"\s*\[remix\]", " (Remix)", s, flags=re.I)  # a different recording: kept
    s = re.sub(r"\s*\((ao vivo[^)]*|afrociberdelia)\)", "", s, flags=re.I)
    s = re.sub(r"\s+-\s+(ao vivo|remastered)$", "", s, flags=re.I)
    s = re.sub(r"\s*•\s*Für dich empfohlen", "", s)  # YouTube's "recommended for you"
    s = re.sub(r"(^|\s)_([^_]+)_(?=\s|$)", r"\1\2", s)  # Santanna _O Cantador_ (was quotes)
    s = re.sub(r"\s_\s|_\s", ", ", s)  # "A _ B" (a medley, was "A / B") and "Suite_ I." (was ":")
    s = s.replace("_", " ")
    return re.sub(r"\s+", " ", s).strip(" -,")


def plan(list_file: Path, stems_dir: Path) -> list[dict]:
    folders = {nfc(p.name): p for p in stems_dir.iterdir() if p.is_dir()}
    songs: dict[str, dict] = {}  # by name, folded: the same name but for case would clash on the phone's storage
    dropped = []
    for line in list_file.read_text(encoding="utf-8").splitlines():
        line = nfc(line.strip())
        if not line:
            continue
        m = re.match(r"^(\d+(?:\.\d+)?) - (.*)\.mp3$", line)
        score, base = (float(m.group(1)), m.group(2)) if m else (None, re.sub(r"\.mp3$", "", line))
        if base not in folders:
            sys.exit(f"No stems folder for: {base}")
        name = clean_name(base)
        yt = YOUTUBE_ID.search(base)
        song = {"base": base, "name": name, "dir": folders[base], "score": score,
                "youtube": (yt.group(1) or yt.group(2)) if yt else None}
        old = songs.get(name.casefold())
        # the same song twice (two downloads): the Forró Stream copy stays, else the first
        if old and (old["youtube"] or not song["youtube"]):
            dropped.append(song)
            continue
        if old:
            dropped.append(old)
        songs[name.casefold()] = song
    for d in dropped:
        print(f"  the same song twice, left out: {d['base']}")
    return list(songs.values())


def make(song: dict, out_dir: Path) -> str:
    src, name = song["dir"], song["name"]
    dst = out_dir / name
    done = dst / f"{name}_info.json"  # written last: its presence means the song is complete
    if done.exists():
        return "skipped"
    dst.mkdir(parents=True, exist_ok=True)
    files = {nfc(p.name): p for p in src.iterdir()}
    stems = []
    for stem in STEMS:
        mp3 = files.get(f"{song['base']}_{stem}.mp3")
        if not mp3:
            continue
        out = dst / f"{name}_{stem}.flac"
        part = dst / f"{name}_{stem}.part.flac"
        subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-y", "-i", str(mp3), "-ac", "1", "-ar", "32000",
                        "-sample_fmt", "s16", "-map_metadata", "-1", str(part)], check=True)
        part.replace(out)
        stems.append(stem)
    beats = files.get(f"{song['base']}_beats.json")
    if beats:
        shutil.copyfile(beats, dst / f"{name}_beats.json")
    info = {"version": 1, "youtube": song["youtube"], "original_name": song["base"], "click_check_score": song["score"]}
    done.write_text(json.dumps(info, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return f"{len(stems)} stems{'' if beats else ', no beats file'}"


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 3:
        sys.exit(__doc__)
    songs = plan(Path(args[0]), Path(args[1]))
    renamed = [s for s in songs if s["name"] != YOUTUBE_ID.sub("", s["base"]).replace(" (Forró Stream)", "")]
    print(f"{len(songs)} songs; names changed beyond the id and (Forró Stream): {len(renamed)}")
    for s in renamed:
        print(f"  {s['base']}\n    → {s['name']}")
    if "--dry-run" in sys.argv:
        return
    out_dir = Path(args[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as pool:
        for i, (song, result) in enumerate(zip(songs, pool.map(lambda s: make(s, out_dir), songs)), 1):
            print(f"[{i}/{len(songs)}] {song['name']}: {result}", flush=True)


if __name__ == "__main__":
    main()
