# Server-side scoring contract

The endpoint accepts multipart audio turns plus JSON metadata:

```json
{
  "sessionId": "uuid",
  "testId": "TEST-001",
  "startedAt": "ISO timestamp",
  "turns": [
    {
      "turnId": "p1-q1",
      "part": 1,
      "prompt": "source question",
      "startedAtSeconds": 19.2,
      "durationSeconds": 22.8,
      "audioField": "turn-p1-q1"
    }
  ]
}
```

## Evaluator response

Require:

```json
{
  "evaluator_id": "A",
  "evidence_status": "complete",
  "transcript": [
    {
      "turn_id": "p1-q1",
      "text": "candidate transcript",
      "segments": [{"start": 19.2, "end": 23.0, "text": "..."}]
    }
  ],
  "criteria": {
    "FC": {"band": 6.5, "why": "Chinese", "why_not_higher": "Chinese", "positive_evidence": [], "limiting_evidence": []},
    "LR": {"band": 6.0, "why": "Chinese", "why_not_higher": "Chinese", "positive_evidence": [], "limiting_evidence": []},
    "GRA": {"band": 6.0, "why": "Chinese", "why_not_higher": "Chinese", "positive_evidence": [], "limiting_evidence": []},
    "P": {"band": 6.5, "why": "Chinese", "why_not_higher": "Chinese", "positive_evidence": [], "limiting_evidence": []}
  },
  "evidence_corrections": [
    {"turn_id": "p3-q2", "start": 430.2, "end": 436.1, "original": "...", "improved": "...", "reason_zh": "..."}
  ],
  "part_diagnostics": {"part1": "Chinese", "part2": "Chinese", "part3": "Chinese"},
  "priorities": [
    {"rank": 1, "diagnosis_zh": "...", "drill_zh": "...", "schedule_zh": "...", "success_measure_zh": "..."}
  ]
}
```

Every evidence item requires `turn_id`, numeric `start`, numeric `end`, and a concrete note. Pronunciation evidence also requires one of:

- `chunking`
- `rhythm`
- `stress`
- `intonation`
- `connected_speech`
- `word_stress`
- `phoneme`
- `intelligibility`

Run evaluator A and evaluator B independently. Do not include the first output in the second prompt. Adjudicate only disputed criteria above 0.5 band. Reject invalid JSON or unsupported bands and retry once.

Use the rubric in the mounted skill as the sole scoring authority. No topical knowledge score. No accent penalty unless intelligibility is affected.

Return:

```json
{
  "status": "scored",
  "label": "IELTS-style estimated band — practice feedback, not an official IELTS score",
  "overall": 6.5,
  "subBands": {"FC": 6.5, "LR": 6.0, "GRA": 6.0, "P": 6.5},
  "diagnosisZh": "...",
  "criteria": {},
  "evidenceCorrections": [],
  "priorities": [],
  "partDiagnostics": {},
  "sevenDayPlan": [],
  "spokenFeedbackZh": "60–120 second Mandarin script"
}
```

If evidence is insufficient, return `status: insufficient_evidence`, an honest Chinese explanation, the missing evidence, and a retake action. Do not fabricate sub-bands or an overall.

## Current calibration

- Direct-audio primary: `thinkingmachines/inkling`
- Direct-audio fallback: `mistralai/voxtral-small-24b-2507`
- Whole-test evaluators and adjudicator: `qwen/qwen3.7-max`
- Official public sample range: Band 5, 6, 6.5, 7, 7.5, 8, 8.5, 9
- Acceptance: every estimate within ±0.5 overall
- Current result: 8/8 within tolerance, mean absolute error 0.125

The evaluator uses anonymised examiner-comment anchors at the adjacent-band boundaries. A concrete anchor correction is allowed only when at least three distinct anchor items appear across multiple turns and the broader grammar, fluency, and direct-audio pattern agrees. One memorised phrase cannot trigger calibration.
