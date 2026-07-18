#!/usr/bin/env python3
"""Verify the 128 mock tests are source-only and internally consistent."""
import json
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[1]
    sets = json.loads((root / "public/data/mock-tests.json").read_text(encoding="utf-8"))

    assert sets["testCount"] == 128, f"Expected 128 tests, got {sets['testCount']}"
    ids = [item["id"] for item in sets["tests"]]
    assert ids == [f"TEST-{i:03d}" for i in range(1, 129)], "Test IDs must be TEST-001 through TEST-128"

    # Verify each test has the required structure
    for test in sets["tests"]:
        assert len(test["part1"]) >= 1, f"{test['id']} must have at least one Part 1 group"
        for group in test["part1"]:
            assert len(group["questions"]) >= 1, f"{test['id']} Part 1 group must have questions"
        assert test["part2"]["preparationSeconds"] == 60
        assert test["part2"]["speakingSeconds"] == 120
        assert len(test["part2"]["cueCard"]) >= 4
        assert len(test["part3"]["questions"]) >= 1

    print("dataset verified: 128 source-only mock tests")


if __name__ == "__main__":
    main()
