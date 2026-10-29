import test from "node:test";
import assert from "node:assert/strict";
import { blinkAmount } from "../../packages/character/expressions.ts";
test("blinks close and reopen through intermediate eyelid positions", () => {
  const samples = Array.from({ length: 18 }, (_, i) => blinkAmount(i / 60));
  assert.equal(samples[0], 0);
  assert.ok(samples.some((v) => v > 0.1 && v < 0.9));
  assert.ok(Math.max(...samples) > 0.99);
  assert.ok(samples.at(-1) < 0.01);
  for (let i = 1; i < samples.length; i++)
    assert.ok(Math.abs(samples[i] - samples[i - 1]) < 0.4);
  assert.equal(blinkAmount(1), 0);
  assert.equal(blinkAmount(0.1, true), 0);
});
