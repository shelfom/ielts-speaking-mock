import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const tests = JSON.parse(fs.readFileSync(new URL("../public/data/mock-tests.json", import.meta.url)));
const audio = JSON.parse(fs.readFileSync(new URL("../public/data/examiner-audio.json", import.meta.url)));

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
