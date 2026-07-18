#!/usr/bin/env python3
"""Assemble 128 source-only IELTS Speaking mock sets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bank", type=Path, required=True)
    parser.add_argument("--mappings", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    bank = json.loads(args.bank.read_text(encoding="utf-8"))
    mappings = json.loads(args.mappings.read_text(encoding="utf-8"))["mappings"]
    tests = []
    for index, cue in enumerate(bank["part2"]):
        topic_indices = [(index * 3 + offset) % len(bank["part1"]) for offset in range(3)]
        part1_groups = []
        for topic_index in topic_indices:
            topic = bank["part1"][topic_index]
            start = (index // len(bank["part1"])) % max(1, len(topic["prompts"]) - 1)
            selected = topic["prompts"][start : start + 2]
            if len(selected) < 2:
                selected += topic["prompts"][: 2 - len(selected)]
            part1_groups.append(
                {
                    "topic": topic["topic"],
                    "sourceRow": topic["sourceRow"],
                    "questions": selected,
                }
            )
        discussion = bank["part3"][mappings[index]["part3"]]
        p3_questions = discussion["prompts"][:7]
        tests.append(
            {
                "id": f"TEST-{index + 1:03d}",
                "title": cue["topic"],
                "part1": part1_groups,
                "part2": {
                    "topic": cue["topic"],
                    "sourceRow": cue["sourceRow"],
                    "cueCard": cue["prompts"],
                    "preparationSeconds": 60,
                    "speakingSeconds": 120,
                    "closingQuestion": p3_questions[0],
                },
                "part3": {
                    "topic": discussion["topic"],
                    "sourceRow": discussion["sourceRow"],
                    "questions": p3_questions[1:] if len(p3_questions) > 1 else p3_questions,
                    "mappingReason": mappings[index].get("reason", ""),
                },
            }
        )
    if len(tests) != 128 or len({item["id"] for item in tests}) != 128:
        raise SystemExit("expected 128 unique tests")
    output = {
        "version": bank["version"],
        "source": bank["source"],
        "testCount": len(tests),
        "tests": tests,
    }
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
