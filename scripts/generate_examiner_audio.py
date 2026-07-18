#!/usr/bin/env python3
"""Generate fixed, loud British-female examiner prompt audio."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import subprocess
import tempfile
import random
from pathlib import Path

import edge_tts


PROCEDURAL = [
    "Good morning. My name is Emma. This is an independent IELTS-style speaking practice test.",
    "We will begin with Part 1. I will ask you some questions about yourself and familiar topics.",
    "Thank you. Now we will move on to Part 2.",
    "You have one minute to prepare. You may make notes if you wish.",
    "Your preparation time is over. Please begin speaking now.",
    "Thank you. You have spoken for two minutes.",
    "We will now move on to Part 3. I will ask you some more general questions related to the topic.",
    "Thank you. That is the end of the speaking test.",
    "Please answer in as much detail as you can.",
]


def slug(text: str) -> str:
    readable = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:48]
    digest = hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]
    return f"{readable or 'prompt'}-{digest}.mp3"


def collect_texts(data: dict) -> list[str]:
    texts = list(PROCEDURAL)
    for test in data["tests"]:
        for group in test["part1"]:
            texts.extend(group["questions"])
        texts.append(test["part2"]["cueCard"][0])
        texts.append(test["part2"]["closingQuestion"])
        texts.extend(test["part3"]["questions"])
    return list(dict.fromkeys(texts))


async def render_one(text: str, output: Path, semaphore: asyncio.Semaphore) -> None:
    if output.exists() and output.stat().st_size > 1024:
        return
    async with semaphore:
        for attempt in range(6):
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                temp_path = Path(tmp.name)
            try:
                communicate = edge_tts.Communicate(
                    text,
                    voice="en-GB-SoniaNeural",
                    rate="-3%",
                    pitch="-1Hz",
                    volume="+0%",
                )
                await communicate.save(str(temp_path))
                subprocess.run(
                    [
                        "ffmpeg",
                        "-v",
                        "error",
                        "-y",
                        "-i",
                        str(temp_path),
                        "-af",
                        "loudnorm=I=-15:TP=-1.0:LRA=7",
                        "-ar",
                        "48000",
                        "-ac",
                        "1",
                        "-codec:a",
                        "libmp3lame",
                        "-b:a",
                        "128k",
                        str(output),
                    ],
                    check=True,
                )
                return
            except Exception:
                if attempt == 5:
                    raise
                await asyncio.sleep((2 ** attempt) + random.random())
            finally:
                temp_path.unlink(missing_ok=True)


async def run(args) -> None:
    data = json.loads(args.tests.read_text(encoding="utf-8"))
    texts = collect_texts(data)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    semaphore = asyncio.Semaphore(args.concurrency)
    await asyncio.gather(
        *(render_one(text, args.output_dir / slug(text), semaphore) for text in texts)
    )
    manifest = {
        "voice": "en-GB-SoniaNeural",
        "sampleRate": 48000,
        "channels": 1,
        "targetLoudness": "-15 LUFS / -1 dBTP",
        "count": len(texts),
        "items": {text: f"/audio/examiner/{slug(text)}" for text in texts},
    }
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"generated {len(texts)} examiner prompts")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tests", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--concurrency", type=int, default=8)
    args = parser.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
