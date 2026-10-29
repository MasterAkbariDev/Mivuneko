import test from "node:test";
import assert from "node:assert/strict";
import { nextMood, moods } from "../../packages/character/index.ts";
test("all avatar states are reachable and cycle", () => {
  let state = "idle";
  const seen = new Set();
  for (let i = 0; i < moods.length; i++) {
    seen.add(state);
    state = nextMood(state);
  }
  assert.equal(seen.size, moods.length);
  assert.equal(state, "idle");
  assert.ok(moods.includes("crying") && moods.includes("sleeping"));
});
