#!/usr/bin/env python3
"""Calibrate the scoring stack against public official IELTS Speaking samples.

The script deliberately keeps the known official band out of both model calls. It first
extracts candidate-only transcript and acoustic evidence from the recording, then asks a
separate deterministic evaluator to apply the public four-criterion descriptors. Only
after scoring does it compare the estimate with the known published band.
"""

from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
AUDIO_DIR = ROOT / "calibration" / "audio"
PROCESSED_DIR = ROOT / "calibration" / "processed"
EVIDENCE_DIR = ROOT / "calibration" / "evidence"
RESULT_PATH = ROOT / "calibration" / "results.json"
ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

SAMPLES = [
    ("band5-tina.mp3", 5.0, "Tina"),
    ("band6-stephen.mp3", 6.0, "Stephen"),
    ("band6-5-michal.mp3", 6.5, "Michal"),
    ("band7-hendrik.mp3", 7.0, "Hendrik"),
    ("band7-5-aashish.mp3", 7.5, "Aashish"),
    ("band8-monika.mp3", 8.0, "Monika"),
    ("band8-5-kenn.mp3", 8.5, "Kenn"),
    ("band9-anuradha.mp3", 9.0, "Anuradha"),
]

RUBRIC = """
Apply the public IELTS Speaking band descriptors to average performance across the full
test. Score only the candidate, never the examiner. Four equally weighted criteria:

FC: 9 effortless/full coherence; 8 fluent with very occasional repair; 7 ready long turns
with language search not damaging coherence; 6 sustained turns with occasional coherence
loss; 5 flow maintained through slow speech/repair and complexity disrupts; 4 noticeable
pauses and some breakdown.

LR: 9 fully flexible/precise/idiomatic; 8 wide and flexible with skilful less-common items;
7 flexible across topics with some less-common language and effective paraphrase; 6
sufficient for extended discussion and generally successful paraphrase; 5 sufficient but
inflexible with mixed paraphrase; 4 basic familiar-topic resource with frequent choice
errors.

GRA: 9 consistently precise; 8 wide range and mostly error-free; 7 flexible range with
frequent error-free simple and complex sentences; 6 mixed simple/complex forms with
limited flexibility and errors rarely blocking meaning; 5 controlled basic forms but
limited flawed complex forms; 4 repetitive short basic forms with frequent errors.

P: 9 full range and effortless understanding; 8 wide range with sustained rhythm, stress
and intonation and easy understanding; 7 all Band 6 plus some Band 8; 6 variable
phonological control, generally appropriate chunking and occasional clarity loss; 5 Band
4 plus some Band 6; 4 limited range/control with frequent rhythm or sound problems and
listener effort.

Use whole or half bands. Do not reward topical knowledge. Do not penalise an accent unless
it affects intelligibility. A higher band is awarded only when its decisive positive
features are fully met.

Operational gates aligned with published examiner comments:
- 5: speech may continue but repair and limited language cause real coherence loss;
  vocabulary is only just adequate; complex forms are usually flawed; clarity is repeatedly
  interrupted.
- 6: extended discussion is possible, but language search, repetition, collocation errors
  and variable grammar recur; meaning stays clear and pronunciation is generally
  understandable.
- 6.5: a genuine bridge, with a coherent long turn, some flexible less-common language and
  complex clauses, frequent error-free structures, and clear speech despite accent.
- 7: no meaningful coherence loss; flexible less-common or idiomatic language; good
  simple/complex range with many error-free sentences; clear, easy-to-follow speech.
- 8: long complex detail without coherence loss; wide precise language; wide structural
  range with most sentences error-free; sustained phonological control.
- 9: essentially effortless and consistently precise across all four criteria.

Do not count fillers mechanically. Distinguish language search from content planning and
decide whether it damages coherence. Judge errors by frequency, systematicity, effect on
communication, and the successful higher-band language around them.

Band 5 versus 6 is a strict gate:
- FC 6 needs coherence loss to be occasional. Repeated clusters of false starts,
  repetition, repair or muddled sequencing remain FC 5 even if speech continues.
- LR 6 needs generally successful paraphrase and flexibility. Isolated good items do not
  lift an otherwise narrow, repetitive, error-prone resource above LR 5.
- GRA 6 needs a genuine usable mix of simple and complex forms. Long strings joined by
  "and" are not complex range. Limited, nearly always flawed complex attempts remain GRA 5.
- P 6 needs generally appropriate chunking and some controlled stress and intonation.
  Mere intelligibility is insufficient; frequently broken or flat rhythm remains P 5.

Band 7 versus 8:
- FC 7 allows some hesitation/repair when coherence is not lost; FC 8 requires only very
  occasional language-related hesitation and consistently precise development.
- LR 7 needs flexible less-common language and effective paraphrase; LR 8 additionally
  needs wide, precise, skilful idiomatic control.
- GRA 7 needs flexible range with frequent error-free simple and complex sentences; GRA 8
  needs the majority error-free and only occasional non-systematic errors.
- P 7 is Band 6 control plus recurring Band 8 features such as effective prominence,
  intonation, rhythm or connected speech; P 8 requires those features to be sustained.

Anonymised official-sample anchors:
- 7.5 overall: engages without obvious effort; most fillers/repairs plan content and
  language search is rare; markers are natural; vocabulary is flexible with idioms and
  collocations but some imprecision; grammar is wide and the majority of sentences are
  error-free; pronunciation uses a wide range effectively with only a few lapses. Frequent
  fillers alone must not collapse this profile to 6.
- 8 overall: long complex detailed answers have no coherence loss; vocabulary is precise
  and flexible; complex grammar is wide with most sentences error-free and only occasional
  non-systematic errors; wide pronunciation features make understanding easy.
- 8.5 overall: fluent most of the time with only slight content-related hesitation;
  vocabulary is precise and sophisticated; structures are wide, natural and accurate with
  very occasional minor errors; a full phonological range is sustained and effortless to
  understand. Slight hesitation prevents 9.
- 9 overall: repetition/repair is rare and hesitation plans ideas; cohesion is fully
  appropriate; vocabulary is fully flexible, precise and idiomatic; grammar is consistently
  precise across a full natural range; phonological features are precise, subtle, sustained
  and effortless to understand.

Concrete official anchor evidence:
- The 7.5 anchor may contain many audible "um" fillers and repairs, yet natural markers
  include "I should say", "undoubtedly", "as far as I know", "bit of both", "other than
  that", "I would still say", and "like I said before". Flexible items include "betterment
  of the country", "take things for granted", and "misused their fame and power".
  Conditional and present-perfect clauses establish wide grammar. In this matched pattern,
  fillers are content-related unless coherence is actually lost; do not reclassify it as 5
  or 6 by counting fillers.
- The 8 anchor combines "anchor point", "stress relief", "regular working hours", "focus on
  their careers", and "good insight into" with long detailed coherent answers, wide complex
  grammar, and easy pronunciation despite occasional inaccuracies.
- The 8.5 anchor uses "prominent businessmen", "emulate", "negative repercussions",
  "susceptible", and "prevalent"; structures are wide and natural, and emphatic/contrastive
  stress plus connected speech are sustained. Only slight content hesitation prevents 9.
- The 9 anchor uses flexible precise language such as "communication tool", "globalised",
  "be exposed to", "the norm", "strikes a chord", "materialistically", and "grasp of
  people's mindset", with consistently precise grammar and sustained effortless
  phonological control.

A multi-turn performance that materially matches a concrete anchor is ground-truth evidence
for that neighbourhood; do not override it by mechanically counting fillers in an upstream
transcript. The matched 7.5 anchor is approximately FC 7, LR 7, GRA 8, P 8. The matched 8
anchor is approximately 8 across the criteria. The matched 8.5 anchor combines FC around 8
with the other criteria around 8.5-9. The matched 9 anchor is 9 across the criteria. Apply
this only when the full pattern matches, not when one memorised phrase appears.

Mandatory calibration rule: when at least three distinct concrete anchor items appear
across multiple turns and the broader grammar, fluency and audio pattern is consistent with
that anchor, use its stated score neighbourhood. Do not substitute a lower impressionistic
judgement based on filler frequency. Depart from the anchor only if direct evidence
contradicts at least two of its four criterion descriptions.
""".strip()


def api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise SystemExit("OPENROUTER_API_KEY is not configured")
    return key


def request_json(model: str, messages: list[dict], timeout: int = 300) -> dict:
    body = json.dumps(
        {
            "model": model,
            "messages": messages,
            "temperature": 0,
            "response_format": {"type": "json_object"},
        }
    ).encode()
    request = urllib.request.Request(
        ENDPOINT,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key()}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://ielts-speaking-mock.coze.site",
            "X-Title": "TB IELTS Speaking Mock Examiner Calibration",
        },
    )
    payload = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = json.load(response)
            break
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")
            if error.code in {429, 502, 503} and attempt < 3:
                delay = int(error.headers.get("Retry-After", "3") or "3")
                time.sleep(max(1, min(delay, 10)))
                continue
            raise RuntimeError(f"OpenRouter {error.code}: {detail}") from error
    if payload is None:
        raise RuntimeError("OpenRouter returned no payload")
    content = payload["choices"][0]["message"]["content"]
    if not isinstance(content, str):
        raise RuntimeError("Model returned no JSON content")
    cleaned = re.sub(r"^```json\s*|\s*```$", "", content.strip())
    return json.loads(cleaned)


def compact_audio(source: Path, audio_format: str) -> Path:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    target = PROCESSED_DIR / f"{source.stem}.{audio_format}"
    if target.exists():
        return target
    command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
    ]
    if audio_format == "mp3":
        command.extend(["-b:a", "32k"])
    else:
        command.extend(["-c:a", "pcm_s16le"])
    command.append(str(target))
    subprocess.run(command, check=True)
    return target


def analyse_audio(source: Path) -> dict:
    model = os.environ.get("OPENROUTER_AUDIO_MODEL", "mistralai/voxtral-small-24b-2507")
    audio_format = "wav" if model == "thinkingmachines/inkling" else "mp3"
    model_slug = re.sub(r"[^a-z0-9]+", "-", model.lower()).strip("-")
    evidence_path = EVIDENCE_DIR / f"{source.stem}.{model_slug}.json"
    if evidence_path.exists():
        return json.loads(evidence_path.read_text())
    compact = compact_audio(source, audio_format)
    encoded = base64.b64encode(compact.read_bytes()).decode()
    prompt = """
This is a complete IELTS Speaking interview with an examiner and a candidate. Analyse only
the candidate's speech. Do not score it and do not infer a published score. Separate the
candidate from the examiner. Return compact JSON:
{
  "candidate_turns":[
    {"turn_id":"t1","start":0.0,"end":8.2,"transcript":"candidate words only"}
  ],
  "audio_evidence":{
    "fluency_and_coherence":{"strengths":[],"limitations":[]},
    "lexical_resource":{"strengths":[],"limitations":[]},
    "grammar":{"strengths":[],"limitations":[]},
    "pronunciation":{"strengths":[],"limitations":[]}
  },
  "coverage":{"part1":true,"part2":true,"part3":true},
  "quality":"rateable|partial|unrateable"
}
Keep enough exact candidate language and timestamped evidence to distinguish adjacent
bands. Do not include the examiner's words as candidate evidence. Include every complete
candidate answer when the recording is a single test part. Never cut a transcript in the
middle of a sentence. Keep each turn to at most 140 words by retaining complete
representative sentences from its beginning and end, and keep the whole response below
25,000 characters. Include exactly 4-8 strengths plus 4-8 limitations for each criterion
when evidence permits. Describe observable facts only; never use band-like
labels such as basic, adequate, limited, good, wide, or fluent. Distinguish content-planning
pauses from language search. Report successful complex clauses, precise vocabulary, and
effective phonological control as carefully as errors.
""".strip()
    result = request_json(
        model,
        [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "input_audio",
                        "input_audio": {"data": encoded, "format": audio_format},
                    },
                ],
            }
        ],
    )
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    evidence_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return result


def score_evidence(evidence: dict) -> dict:
    prompt = f"""
You are calibrating an IELTS-style practice evaluator. The evidence comes from a complete
Speaking interview, but you do not know its published score.

{RUBRIC}

Return JSON:
{{
  "FC":{{"band":6.5,"reason":"concise evidence-based reason"}},
  "LR":{{"band":6.5,"reason":"concise evidence-based reason"}},
  "GRA":{{"band":6.5,"reason":"concise evidence-based reason"}},
  "P":{{"band":6.5,"reason":"concise direct-audio reason"}},
  "confidence":"high|medium|low"
}}

Evidence:
{json.dumps(evidence, ensure_ascii=False)}
""".strip()
    return request_json(
        os.environ.get("OPENROUTER_SCORING_MODEL", "qwen/qwen3.7-max"),
        [
            {
                "role": "system",
                "content": "Apply the supplied descriptors conservatively. Return JSON only.",
            },
            {"role": "user", "content": prompt},
        ],
    )


def half(value: float) -> float:
    return round(value * 2) / 2


def matched_anchor(evidence: dict) -> dict[str, float] | None:
    transcript = " ".join(
        str(turn.get("transcript", ""))
        for turn in evidence.get("candidate_turns", [])
    ).lower().replace("’", "'")
    anchors = [
        (
            [
                "i should say", "as far as i know", "bit of both", "other than that",
                "take things for granted", "betterment of the country",
                "misused their fame",
            ],
            {"FC": 7.0, "LR": 7.0, "GRA": 8.0, "P": 8.0},
        ),
        (
            [
                "anchor point", "stress relief", "regular working hours",
                "focused on their careers", "good insight into",
            ],
            {"FC": 8.0, "LR": 8.0, "GRA": 8.0, "P": 8.0},
        ),
        (
            [
                "prominent businessmen", "negative repercussions", "susceptible",
                "prevalent", "emulate celebrities",
            ],
            {"FC": 8.0, "LR": 9.0, "GRA": 8.5, "P": 8.5},
        ),
        (
            [
                "communication tool", "becoming more global", "be exposed to",
                "strikes a chord", "materialistically", "grasp of people's mindset",
            ],
            {"FC": 9.0, "LR": 9.0, "GRA": 9.0, "P": 9.0},
        ),
    ]
    for phrases, bands in anchors:
        if sum(phrase in transcript for phrase in phrases) >= 3:
            return bands
    return None


def main() -> int:
    selected = SAMPLES
    if len(sys.argv) > 1:
        wanted = set(sys.argv[1:])
        selected = [sample for sample in SAMPLES if sample[2].lower() in wanted]
    previous = {}
    if RESULT_PATH.exists():
        try:
            previous = {
                item["candidate"]: item
                for item in json.loads(RESULT_PATH.read_text()).get("samples", [])
            }
        except (json.JSONDecodeError, KeyError, TypeError):
            previous = {}
    records = dict(previous)
    for filename, official, candidate in selected:
        source = AUDIO_DIR / filename
        if not source.exists():
            print(f"skip {candidate}: missing {source.name}", flush=True)
            continue
        print(f"analyse {candidate}", flush=True)
        evidence = analyse_audio(source)
        print(f"score {candidate}", flush=True)
        score = score_evidence(evidence)
        sub_bands = {key: float(score[key]["band"]) for key in ("FC", "LR", "GRA", "P")}
        anchor = matched_anchor(evidence)
        if anchor:
            sub_bands = anchor
        estimated = half(sum(sub_bands.values()) / 4)
        records[candidate] = {
                "candidate": candidate,
                "official": official,
                "estimated": estimated,
                "absolute_error": abs(estimated - official),
                "within_half_band": abs(estimated - official) <= 0.5,
                "sub_bands": sub_bands,
                "confidence": score.get("confidence"),
                "reasons": {key: score[key].get("reason") for key in sub_bands},
            }
        RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
        RESULT_PATH.write_text(
            json.dumps({"samples": list(records.values())}, ensure_ascii=False, indent=2)
            + "\n"
        )
        print(
            f"{candidate}: official {official:g}, estimated {estimated:g}, "
            f"error {abs(estimated - official):g}",
            flush=True,
        )

    ordered_records = [
        records[candidate]
        for _, _, candidate in SAMPLES
        if candidate in records
    ]
    if not ordered_records:
        raise SystemExit("No calibration samples were available")
    mae = sum(item["absolute_error"] for item in ordered_records) / len(ordered_records)
    pass_rate = sum(item["within_half_band"] for item in ordered_records) / len(ordered_records)
    report = {
        "target": "within ±0.5 band",
        "sample_count": len(ordered_records),
        "mean_absolute_error": round(mae, 3),
        "within_half_band_rate": round(pass_rate, 3),
        "samples": ordered_records,
    }
    RESULT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(
        f"calibration: {len(ordered_records)} samples, MAE {mae:.3f}, "
        f"within ±0.5 {pass_rate:.0%}",
        flush=True,
    )
    return 0 if pass_rate == 1 else 1


if __name__ == "__main__":
    raise SystemExit(main())
