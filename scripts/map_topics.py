#!/usr/bin/env python3
"""Map each Part 2 cue card to the closest source Part 3 discussion bank."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from openai import OpenAI


def load_env(path: Path) -> None:
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key, value)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bank", type=Path, required=True)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    load_env(args.env_file)
    bank = json.loads(args.bank.read_text(encoding="utf-8"))

    part2 = [
        {"index": i, "topic": item["topic"], "cue": item["prompts"][0]}
        for i, item in enumerate(bank["part2"])
    ]
    part3 = [
        {"index": i, "topic": item["topic"], "sample": item["prompts"][:3]}
        for i, item in enumerate(bank["part3"])
    ]
    prompt = f"""
Map every Part 2 IELTS Speaking cue card to exactly one semantically closest Part 3
discussion bank. Use only the supplied zero-based Part 3 indices. Match the underlying
discussion domain, not just exact word overlap. Return strict JSON only:
{{"mappings":[{{"part2":0,"part3":12,"reason":"brief reason"}}]}}
There must be exactly {len(part2)} mapping objects, ordered by part2 from 0 to
{len(part2)-1}, with no missing or duplicate part2 values. Reuse Part 3 banks when
appropriate.

PART 2:
{json.dumps(part2, ensure_ascii=False)}

PART 3:
{json.dumps(part3, ensure_ascii=False)}
""".strip()
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], base_url="https://openrouter.ai/api/v1")
    response = client.chat.completions.create(
        model=os.environ.get("MODEL", "deepseek/deepseek-v4-flash"),
        messages=[
            {"role": "system", "content": "You are a meticulous IELTS speaking test-set editor."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0,
    )
    payload = json.loads(response.choices[0].message.content)
    mappings = payload.get("mappings")
    if not isinstance(mappings, list) or len(mappings) != len(part2):
        raise SystemExit(f"expected {len(part2)} mappings, got {len(mappings or [])}")
    observed = [item.get("part2") for item in mappings]
    if observed != list(range(len(part2))):
        raise SystemExit("part2 mapping indices are missing, duplicated, or out of order")
    if any(not isinstance(item.get("part3"), int) or not 0 <= item["part3"] < len(part3) for item in mappings):
        raise SystemExit("invalid part3 mapping index")
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
