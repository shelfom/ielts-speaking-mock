#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((root / "public/data/examiner-audio.json").read_text(encoding="utf-8"))
    assert manifest["voice"] == "en-GB-SoniaNeural"
    assert manifest["count"] == len(manifest["items"])
    files = []
    for path in manifest["items"].values():
        file = root / "public" / path.lstrip("/")
        assert file.exists() and file.stat().st_size > 1024, file
        files.append(file)
    sample = files[:: max(1, len(files) // 20)]
    for file in sample:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=sample_rate,channels,codec_name",
                "-of",
                "json",
                str(file),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        stream = json.loads(result.stdout)["streams"][0]
        assert stream["sample_rate"] == "48000"
        assert stream["channels"] == 1
        assert stream["codec_name"] == "mp3"
    print(f"audio verified: {len(files)} files; {len(sample)} technical samples")


if __name__ == "__main__":
    main()
