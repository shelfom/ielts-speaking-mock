# TB IELTS Speaking Mock Examiner

## Product

Build a production full-stack responsive web application for anonymous public practice. It must work on desktop and phone. The live test screen is fixed to `100dvh` with no page scroll; the results screen may scroll.

Visible product name: `IELTS Speaking Mock Test`

Visible disclaimer: `Independent IELTS-style practice — not an official IELTS test or score`

Brand footer: `海归湾国际教育（天津）雅思精准学习中心  400-061-6820`

Do not use the protected IELTS logo and do not imply endorsement.

## Source data

Use `public/data/mock-tests.json` exactly. It contains 128 source-only mock sets. Do not invent, rewrite, translate, reorder, or silently skip source questions.

Test selection:

- default `Test 001`;
- allow selection of Tests 001–128 before microphone preflight;
- remember only the last selected test locally;
- do not persist recordings or reports in remote user accounts.

## Test flow

### Preflight

Show a concise microphone/speaker check. Let the candidate record five seconds, play it back, and confirm the level meter moves. The actual `Start test` button remains visible and begins immediately when clicked.

### Examiner conduct

- British female examiner voice.
- Neutral delivery with no coaching, praise, correction, or filler feedback.
- Part 1 and Part 3 question text must not be visible.
- Part 2 cue card must be visible.
- Examiner audio is preloaded before each prompt.
- Candidate can use `Done speaking` as a visible fallback; silence detection may end a turn, but must not cut off a candidate who is still speaking.

### Part 1

- Target 4–5 minutes.
- Ask all six source questions from the selected set in order.
- Record each candidate answer as a separate timestamped turn.

### Part 2

- Show the exact cue card.
- Start a visible 60-second preparation timer.
- Then play the standard speaking invitation and allow up to 120 seconds uninterrupted.
- Show the countdown discreetly; do not pressure the candidate with flashing warnings.
- Ask the source closing question.

### Part 3

- Target 4–5 minutes.
- Ask all source questions in order.
- Record every candidate answer as a separate timestamped turn.

### End

Show `Analysing your speaking` and upload compressed audio turns in the background. Never expose an API key in client code.

## Scoring

Use the mounted `ielts-speaking-scorer` skill. Score average performance across the whole test.

- Four equally weighted sub-bands: FC, LR, GRA, P.
- Whole or half bands.
- Deterministic overall = equal-weight mean rounded to nearest 0.5.
- Two independent evaluators.
- If a criterion differs by more than 0.5, run an adjudicator.
- Every band and recommendation needs timestamped evidence.
- Pronunciation must use direct audio: chunking, rhythm, stress, intonation, connected speech, phonemes, intelligibility.
- Poor or incomplete audio returns insufficient evidence rather than false precision.

Use a server-side audio-capable evaluator. Store its credential only in the project environment as `OPENROUTER_API_KEY`. Use `mistralai/voxtral-small-24b-2507` for direct-audio turn analysis and `deepseek/deepseek-v4-flash` for the two independent whole-test evaluators and adjudication. Use strict JSON outputs and validate them before rendering.

Delete temporary uploaded recordings after analysis and in every case within 24 hours. Do not retain raw candidate recordings in browser storage.

## Results

Order the page exactly:

1. overall estimate and FC/LR/GRA/P sub-bands;
2. one-sentence Chinese diagnosis;
3. four criteria: why this band and why not higher;
4. timestamped English evidence, natural corrections, and supported pronunciation notes;
5. up to three ranked priorities with exact drills;
6. Part 1, Part 2, and Part 3 comparison;
7. seven-day plan.

Add a manual `听中文点评` button. Spoken Chinese feedback must never autoplay. Add `Download report` and `Try another test`. Save only a compact report summary and recent test IDs locally unless the candidate downloads the full report.

## Visual direction

Use the supplied screenshot as inspiration, not a pixel copy:

- luminous cyan/blue outer atmosphere;
- large rounded deep-aubergine exam panel;
- focused central blue audio orb with a restrained waveform;
- warm orange Part 2 cue/preparation card;
- one strong primary action;
- calm, premium, audio-first, minimal.

Avoid generic dashboards, glass-card clutter, excessive gradients, talking-head avatars, stock photos, and visible transcripts during the test.

Desktop: centered exam panel with generous negative space.

Phone: one fixed-screen exam panel, controls reachable by thumb, no clipped lower controls, no scrolling during the live test.

Accessibility:

- 44px minimum touch targets;
- visible keyboard focus;
- status text beyond color;
- reduced-motion mode;
- clear permission/error recovery;
- no hidden required controls.

## Acceptance

Test at 320×568, 375×667, 390×844, 430×932, 1366×768, and 1440×900 in Safari/Chrome behavior. No horizontal overflow. No live-test page scroll. Audio begins promptly after the examiner status changes. All 128 test IDs load. Refreshing during a live test must ask the candidate before discarding the session.
