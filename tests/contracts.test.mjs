import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const tests = JSON.parse(fs.readFileSync(new URL("../public/data/mock-tests.json", import.meta.url)));
const audio = JSON.parse(fs.readFileSync(new URL("../public/data/examiner-audio.json", import.meta.url)));
const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const scorer = fs.readFileSync(new URL("../app/api/score/route.ts", import.meta.url), "utf8");
const openrouter = fs.readFileSync(new URL("../lib/openrouter.ts", import.meta.url), "utf8");

test("all 128 tests and fixed examiner audio are present", () => {
  assert.equal(tests.tests.length, 128);
  assert.equal(tests.tests[0].id, "TEST-001");
  assert.equal(tests.tests.at(-1).id, "TEST-128");
  assert.equal(Object.keys(audio.items).length, 691);
});

test("every live prompt resolves to a fixed British audio asset", () => {
  for (const mock of tests.tests) {
    for (const group of mock.part1) {
      for (const prompt of group.questions) assert.ok(audio.items[prompt], prompt);
    }
    assert.ok(audio.items[mock.part2.closingQuestion]);
    for (const prompt of mock.part3.questions) assert.ok(audio.items[prompt], prompt);
  }
});

test("Part 2 timings and source-only cue structure are fixed", () => {
  for (const mock of tests.tests) {
    assert.equal(mock.part2.preparationSeconds, 60);
    assert.equal(mock.part2.speakingSeconds, 120);
    assert.ok(mock.part2.cueCard.length >= 4);
  }
});

test("completed scoring evidence survives transient provider failures", () => {
  assert.match(page, /sessionStorage\.setItem\(PENDING_SCORE_KEY/);
  assert.match(page, /screen === "recovery"/);
  assert.match(page, /Retry scoring/);
  assert.doesNotMatch(
    page,
    /Scoring could not be completed[\s\S]{0,180}setScreen\("home"\)/
  );
});

test("two model families score independently and one call adjudicates all disputes", () => {
  assert.match(scorer, /EVALUATOR_A_MODELS/);
  assert.match(scorer, /EVALUATOR_B_MODELS/);
  assert.match(scorer, /openai\/gpt-5-mini/);
  assert.match(scorer, /anthropic\/claude-sonnet-4\.5/);
  assert.match(scorer, /disputedCriteria/);
  assert.match(scorer, /adjudication\.results/);
  assert.match(scorer, /timeoutMs:\s*50000/);
  assert.match(scorer, /timeoutMs:\s*25000/);
  assert.match(scorer, /maxAttempts:\s*1/);
  assert.match(scorer, /EVALUATION_DEADLINE/);
  assert.match(scorer, /ADJUDICATION_DEADLINE/);
  assert.match(scorer, /reasoningEffort:\s*"minimal"/);
});

test("OpenRouter uses model fallbacks, strict schemas, response healing, and bounded attempts", () => {
  assert.match(openrouter, /models: options\.models/);
  assert.match(openrouter, /type: "json_schema"/);
  assert.match(openrouter, /response-healing/);
  assert.match(openrouter, /maxAttempts/);
  assert.match(openrouter, /TRANSIENT_STATUSES/);
});
