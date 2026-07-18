export const RUBRIC = `
Rate average performance across all three parts. A band is awarded only when its positive
features are fully met. Four equally weighted criteria:

FC: 9 effortless/full coherence; 8 fluent with very occasional repair; 7 ready long turns
with language search not damaging coherence; 6 sustained turns with occasional coherence
loss; 5 flow maintained through slow speech/repair and complexity disrupts; 4 noticeable
pauses and some breakdown.

LR: 9 fully flexible/precise/idiomatic; 8 wide and flexible with skilful less-common items;
7 flexible across topics with some less-common language and effective paraphrase; 6
sufficient for extended discussion and generally successful paraphrase; 5 sufficient but
inflexible with mixed paraphrase; 4 basic familiar-topic resource with frequent choice errors.

GRA: 9 consistently precise; 8 wide range and mostly error-free; 7 flexible range with
frequent error-free simple and complex sentences; 6 mixed simple/complex forms with
limited flexibility and errors rarely blocking meaning; 5 controlled basic forms but
limited flawed complex forms; 4 repetitive short basic forms with frequent errors.

P: 9 full range and effortless understanding; 8 wide range with sustained rhythm/stress/
intonation and easy understanding; 7 all Band 6 plus some Band 8; 6 variable phonological
control, generally appropriate chunking and occasional clarity loss; 5 Band 4 plus some
Band 6; 4 limited range/control with frequent rhythm or sound problems and listener effort.

Accent is neutral unless it affects intelligibility. Pronunciation evidence must come from
direct audio observations: chunking, rhythm, stress, intonation, connected speech, word
stress, phonemes, and intelligibility.
`.trim();

export const OUTPUT_CONTRACT = `
Return JSON only. Use bands from 0 to 9 in 0.5 increments. Every rateable criterion needs
at least two positive and two limiting evidence entries. Each entry must include turn_id,
start, end, and note. Pronunciation evidence also includes audio_feature.
`.trim();

export function roundHalf(value: number): number {
  return Math.round((value + Number.EPSILON) * 2) / 2;
}
