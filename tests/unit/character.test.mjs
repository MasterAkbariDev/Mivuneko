import test from "node:test";
import assert from "node:assert/strict";
import { nextMood, moods } from "../../packages/character/index.ts";
test("all fourteen avatar states are reachable and cycle", () => {
  let state = "idle";
  const seen = new Set();
  for (let i = 0; i < 14; i++) {
    seen.add(state);
    state = nextMood(state);
  }
  assert.equal(seen.size, 14);
  assert.equal(state, "idle");
  assert.equal(moods.length, 14);
});
