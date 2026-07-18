#!/usr/bin/env python3
import json
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[1]
    bank = json.loads((root / "data/topic-bank.json").read_text(encoding="utf-8"))
    sets = json.loads((root / "public/data/mock-tests.json").read_text(encoding="utf-8"))
    assert bank["counts"] == {
        "part1": 50,
        "part2": 128,
        "part3": 64,
        "part1Prompts": 380,
        "part2Prompts": 643,
        "part3Prompts": 587,
    }
    assert sets["testCount"] == 128
    assert [item["id"] for item in sets["tests"]] == [f"TEST-{i:03d}" for i in range(1, 129)]
    source_p1 = {prompt for group in bank["part1"] for prompt in group["prompts"]}
    source_p2 = {prompt for group in bank["part2"] for prompt in group["prompts"]}
    source_p3 = {prompt for group in bank["part3"] for prompt in group["prompts"]}
    for test in sets["tests"]:
        assert all(question in source_p1 for group in test["part1"] for question in group["questions"])
        assert all(line in source_p2 for line in test["part2"]["cueCard"])
        assert test["part2"]["closingQuestion"] in source_p3
        assert all(question in source_p3 for question in test["part3"]["questions"])
    print("dataset verified: 128 source-only mock tests")


if __name__ == "__main__":
    main()
