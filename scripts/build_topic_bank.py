#!/usr/bin/env python3
"""Parse annotated Feishu CSV snapshots into a stable IELTS Speaking topic bank."""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
from pathlib import Path


TYPO_FIXES = {
    "Accomodation": "Accommodation",
    "accomodation": "accommodation",
    "trourist": "tourist",
    "enviroment": "environment",
}


def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text.strip())
    for wrong, right in TYPO_FIXES.items():
        text = re.sub(rf"\b{re.escape(wrong)}\b", right, text)
    text = re.sub(r"\s+([,?.!;:])", r"\1", text)
    text = re.sub(r"([,?.!;:])(?=[A-Za-z])", r"\1 ", text)
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+\)", ")", text)
    return text.strip()


def parse_snapshot(path: Path) -> list[dict]:
    envelope = json.loads(path.read_text(encoding="utf-8"))
    annotated = envelope["data"]["annotated_csv"]
    cleaned_csv = "\n".join(
        re.sub(r"^\[row=(\d+)\]\s?", "", line) for line in annotated.splitlines()
    )
    rows = list(csv.reader(io.StringIO(cleaned_csv)))
    groups: list[dict] = []
    current = None
    for row_number, row in enumerate(rows[1:], start=2):
        row += [""] * (11 - len(row))
        topic = clean_text(row[0])
        prompts = [clean_text(cell) for cell in row[1:] if clean_text(cell)]
        if topic:
            if current:
                groups.append(current)
            current = {"sourceRow": row_number, "topic": topic, "prompts": []}
        if current:
            current["prompts"].extend(prompts)
    if current:
        groups.append(current)
    return groups


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--part1", type=Path, required=True)
    parser.add_argument("--part2", type=Path, required=True)
    parser.add_argument("--part3", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    parts = {
        "part1": parse_snapshot(args.part1),
        "part2": parse_snapshot(args.part2),
        "part3": parse_snapshot(args.part3),
    }
    expected = {"part1": 50, "part2": 128, "part3": 64}
    observed = {key: len(value) for key, value in parts.items()}
    if observed != expected:
        raise SystemExit(f"unexpected topic counts: {observed}")
    prompt_counts = {key: sum(len(group["prompts"]) for group in value) for key, value in parts.items()}
    if prompt_counts != {"part1": 380, "part2": 643, "part3": 587}:
        raise SystemExit(f"unexpected prompt counts: {prompt_counts}")

    output = {
        "version": "2026-07-18",
        "source": {
            "spreadsheetToken": "IPMPsfKRThGqDuteCU9cwWgmnqb",
            "part1Sheet": "DuTwxH",
            "part2Sheet": "LxDjsx",
            "part3Sheet": "TH2WmK",
        },
        "counts": {**observed, **{f"{key}Prompts": value for key, value in prompt_counts.items()}},
        **parts,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
