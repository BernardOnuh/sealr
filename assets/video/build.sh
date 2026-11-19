#!/bin/sh
# Build the narrated explainer: audio + timeline, frames, silent video, final mix.
# usage: ./build.sh WORK_DIR OUT.mp4 [elevenlabs|say] [VOICE_ID]
set -e
LOCK=/tmp/sealr-video-build.lock
mkdir "$LOCK" 2>/dev/null || { echo "another Sealr video build is running"; exit 1; }
trap 'rmdir "$LOCK"' EXIT
cd "$(dirname "$0")"
WORK="$1"; OUT="$2"; ENGINE="${3:-elevenlabs}"; VOICE="$4"
mkdir -p "$WORK"; rm -rf "$WORK/frames"
python3 -I generate_audio.py "$WORK" --engine "$ENGINE" ${VOICE:+--voice-id "$VOICE"}
python3 -I render_frames.py "$WORK/frames" --page sealr.html
swiftc -O encode.swift -o "$WORK/encode" 2>/dev/null
swiftc -O finish.swift -o "$WORK/finish" 2>/dev/null
"$WORK/encode" "$WORK/frames" "$WORK/silent.mp4" 30
"$WORK/finish" "$WORK/silent.mp4" "$WORK/mix.json" "$OUT"
