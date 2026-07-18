#!/usr/bin/env python3
"""Verify the saved official-sample calibration acceptance record."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
report = json.loads((ROOT / "calibration" / "results.json").read_text())
samples = report.get("samples", [])

assert len(samples) == 8, f"expected 8 official samples, got {len(samples)}"
assert [item["official"] for item in samples] == [5, 6, 6.5, 7, 7.5, 8, 8.5, 9]
assert all(item["absolute_error"] <= 0.5 for item in samples)
assert report["within_half_band_rate"] == 1
assert report["mean_absolute_error"] <= 0.5

print(
    "calibration verified: "
    f"{len(samples)}/8 within ±0.5; MAE {report['mean_absolute_error']:.3f}"
)
