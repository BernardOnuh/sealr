#!/usr/bin/env python3
"""Make the narration, music and sound effects for the explainer, plus timeline.js and mix.json.

usage: python3 generate_audio.py WORK_DIR [--engine elevenlabs|say] [--voice-id ID]

elevenlabs: reads ELEVENLABS_API_KEY from the environment or assets/video/.env (never printed). Narration comes
  with per-character timestamps, so visuals can land on exact words. Every API response is
  cached in ~/.cache/sealr-video, so re-rendering does not spend credits again.
say: macOS voice, no music or effects; word times are estimated. For drafts.
"""
import argparse
import base64
import hashlib
import json
import re
import subprocess
import urllib.error
import urllib.request
import socket
import wave
from pathlib import Path

# Some networks' resolver fails for hosts that public DNS answers; fall back to asking 1.1.1.1 directly.
_getaddrinfo = socket.getaddrinfo


def _fallback_getaddrinfo(host, *args, **kw):
    try:
        return _getaddrinfo(host, *args, **kw)
    except socket.gaierror:
        out = subprocess.run(["dig", "+short", host, "@1.1.1.1"], capture_output=True, text=True).stdout.split()
        ip = next((a for a in out if re.fullmatch(r"[0-9.]+", a)), None)
        if not ip:
            raise
        return _getaddrinfo(ip, *args, **kw)


socket.getaddrinfo = _fallback_getaddrinfo

HERE = Path(__file__).resolve().parent
CACHE = Path.home() / ".cache" / "sealr-video"
API = "https://api.elevenlabs.io"


def load_key():
    """ELEVENLABS_API_KEY from the environment, assets/video/.env, or ~/.config/elevenlabs/key."""
    import os
    if os.environ.get("ELEVENLABS_API_KEY"):
        return os.environ["ELEVENLABS_API_KEY"].strip()
    env = HERE / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "ELEVENLABS_API_KEY" and value.strip():
                return value.strip().strip("'\"")
    for env in (HERE.parents[1] / ".env", Path.home() / "leash" / "assets" / "video" / ".env"):  # Sealr's .env, then the key Leash used
        if env.exists():
            for line in env.read_text().splitlines():
                name, _, value = line.partition("=")
                if name.strip() == "ELEVENLABS_API_KEY" and value.strip():
                    return value.strip().strip("'\"")
    path = Path.home() / ".config" / "elevenlabs" / "key"
    if path.exists():
        return path.read_text().strip()
    raise SystemExit("No ElevenLabs key: add ELEVENLABS_API_KEY=... to assets/video/.env")


def norm(word):
    return re.sub(r"[^a-z0-9]", "", word.lower())


def eleven(path, body, key, binary=True):
    """POST to ElevenLabs with on-disk caching keyed by the request."""
    CACHE.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(json.dumps([path, body], sort_keys=True).encode()).hexdigest()[:24]
    cached = CACHE / digest
    if cached.exists():
        return cached.read_bytes()
    req = urllib.request.Request(API + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"xi-api-key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = resp.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError("ElevenLabs %s -> HTTP %d: %s" % (path.split("?")[0], e.code, e.read().decode(errors="replace")[:400]))
    cached.write_bytes(data)
    return data


def word_times(chars, starts):
    """[(word, start_seconds)] from per-character alignment."""
    words, cur, t0 = [], "", None
    for c, s in zip(chars, starts):
        if c.isspace():
            if cur:
                words.append((cur, t0))
            cur, t0 = "", None
        else:
            if not cur:
                t0 = s
            cur += c
    if cur:
        words.append((cur, t0))
    return words


def resolve_cues(cues, words):
    out, i = {}, 0
    for cue in cues:
        while i < len(words) and norm(words[i][0]) != norm(cue):
            i += 1
        if i == len(words):
            raise ValueError("cue %r not found in narration" % cue)
        out[cue] = round(words[i][1], 3)
        i += 1
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("work")
    ap.add_argument("--engine", choices=["elevenlabs", "say"], default="elevenlabs")
    ap.add_argument("--voice-id")
    ap.add_argument("--say-voice", default="Samantha")
    args = ap.parse_args()
    work = Path(args.work)
    (work / "audio").mkdir(parents=True, exist_ok=True)
    spec = json.loads((HERE / "vo.json").read_text())
    lines = spec["lines"]

    key = None
    if args.engine == "elevenlabs":
        key = load_key()
        voice = args.voice_id or spec["voice"]["elevenlabs_voice_id"]

    t = spec["lead_in"]
    timeline, voice_clips = [], []
    for i, line in enumerate(lines):
        if args.engine == "elevenlabs":
            body = {"text": line.get("speak", line["text"]), "model_id": spec["voice"]["model_id"], "voice_settings": spec["voice"]["settings"]}  # no neighbouring text: keeps the bill to the narration itself
            res = json.loads(eleven("/v1/text-to-speech/%s/with-timestamps?output_format=mp3_44100_128" % voice, body, key))
            clip = work / "audio" / ("%s.mp3" % line["id"])
            clip.write_bytes(base64.b64decode(res["audio_base64"]))
            al = res["alignment"]
            dur = al["character_end_times_seconds"][-1] + 0.08
            words = word_times(al["characters"], al["character_start_times_seconds"])
        else:
            clip = work / "audio" / ("%s.wav" % line["id"])
            subprocess.run(["say", "-v", args.say_voice, "-r", "172", "--file-format=WAVE", "--data-format=LEI16@24000",
                            "-o", str(clip), line.get("speak", line["text"])], check=True)
            with wave.open(str(clip)) as w:
                dur = w.getnframes() / w.getframerate()
            spoken = line.get("speak", line["text"])
            toks, n, pos = spoken.split(), len(spoken), 0
            words = []
            for tok in toks:
                pos = spoken.index(tok, pos)
                words.append((tok, dur * pos / n))
                pos += len(tok)
        entry = {k: v for k, v in line.items() if k not in ("cues", "speak")}
        entry.update(start=round(t, 3), end=round(t + dur, 3),
                     cues={c: round(t + s, 3) for c, s in resolve_cues(line.get("cues", []), words).items()})
        timeline.append(entry)
        voice_clips.append({"file": str(clip), "start": round(t, 3), "volume": 1.0})
        t += dur + line["pause"]
    total = round(t, 3)

    def when(ref):
        line = next(l for l in timeline if l["id"] == ref[0])
        return line["cues"][ref[1]] if isinstance(ref[1], str) else line["start"] + ref[1]

    mix = {"duration": total, "voice": voice_clips, "sfx": [], "music": None,
           "voice_ranges": [[l["start"], l["end"]] for l in timeline]}
    if args.engine == "elevenlabs":
        for fx in spec.get("sfx", []):
            try:
                data = eleven("/v1/sound-generation", {"text": fx["text"], "duration_seconds": fx["seconds"], "prompt_influence": 0.5}, key)
            except RuntimeError as e:
                print("sound effects skipped:", e)
                break
            path = work / "audio" / ("sfx-%s.mp3" % fx["id"])
            path.write_bytes(data)
            start = when(fx["at"])
            until = when(fx["until"]) if "until" in fx else start + 0.01
            while start < until:  # "every"/"until" repeat a bed, such as projector rattle, across a stretch
                mix["sfx"].append({"file": str(path), "start": round(start, 3), "volume": fx["volume"]})
                start += fx.get("every", 1e9)
        music = spec.get("music")
        try:
            if not music:
                raise RuntimeError("none in vo.json")
            data = eleven("/v1/music?output_format=mp3_44100_128",
                          {"prompt": music["prompt"], "music_length_ms": int(total * 1000) + 500,
                           "force_instrumental": True, "model_id": "music_v1"}, key)
            path = work / "audio" / "music.mp3"
            path.write_bytes(data)
            mix["music"] = {"file": str(path), "volume": music["volume"], "duck_to": music["duck_to"]}
        except RuntimeError as e:
            print("music skipped:", e)

    (HERE / "timeline.js").write_text("window.TIMELINE = %s;\nwindow.TOTAL = %.3f;\n" % (json.dumps(timeline), total))
    (work / "mix.json").write_text(json.dumps(mix, indent=1))
    for l in timeline:
        print("%6.2f-%6.2f  %-8s %s" % (l["start"], l["end"], l["scene"], l["text"][:66]))
    print("total %.1fs · %d voice clips · %d effects · music: %s" % (total, len(voice_clips), len(mix["sfx"]), "yes" if mix["music"] else "no"))


if __name__ == "__main__":
    main()
