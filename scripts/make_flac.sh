#!/usr/bin/env bash
# The stems as the app plays them, so it can skip most of the decoding: mono, 32 kHz, 16-bit FLAC (lossless,
# so no second lossy pass; smaller than the mp3s). They go in a flac/ folder inside each song folder, the mp3s
# stay as they are. The app prefers them when it finds them: ~3x faster to open, half the memory.
#
#     scripts/make_flac.sh <folder>...    a song folder, or a folder of song folders
#
# Stems already converted (flac newer than its mp3) are skipped. Needs ffmpeg.
set -euo pipefail
[ $# -gt 0 ] || { echo "usage: $0 <song folder or folder of song folders>..." >&2; exit 1; }

made=0 skipped=0
while IFS= read -r -d '' mp3; do
  dir=$(dirname "$mp3")
  out="$dir/flac/$(basename "$mp3" .mp3).flac"
  if [ "$out" -nt "$mp3" ]; then skipped=$((skipped + 1)); continue; fi
  mkdir -p "$dir/flac"
  ffmpeg -v error -nostdin -y -i "$mp3" -ac 1 -ar 32000 -sample_fmt s16 -map_metadata -1 "$out.part.flac"
  mv "$out.part.flac" "$out"
  echo "$out"
  made=$((made + 1))
done < <(find "$@" -maxdepth 2 -not -path '*/flac/*' -type f \
  \( -name '*_vocals.mp3' -o -name '*_guitar.mp3' -o -name '*_piano.mp3' \
     -o -name '*_bass.mp3' -o -name '*_drums.mp3' -o -name '*_other.mp3' \) -print0)
echo "$made made, $skipped already there" >&2
