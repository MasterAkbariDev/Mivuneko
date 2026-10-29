import test from "node:test";
import assert from "node:assert/strict";
import { createWheelScaler } from "../../packages/shared-schemas/wheel.ts";
test("scrolling up grows and down shrinks in 5% steps", () => {
  const w = createWheelScaler(() => 0);
  assert.equal(w.push(-40, 0, 1), 1.05);
  assert.equal(w.push(40, 0, 1), 0.95);
});
test("a mouse notch moves two steps; small trackpad deltas accumulate", () => {
  let t = 0;
  const w = createWheelScaler(() => t);
  assert.equal(w.push(-100, 0, 1), 1.1);
  // 20px left over from the notch: one more 10px is still below a step, the next completes it.
  assert.equal(w.push(-10, 0, 1), null, "below one step");
  assert.equal(w.push(-10, 0, 1), 1.05);
});
test("line and page delta modes are normalised", () => {
  const w = createWheelScaler(() => 0);
  assert.equal(w.push(-3, 1, 1), 1.05);
});
test("the scale is clamped to 50%–400% and stale movement is dropped", () => {
  let t = 0;
  const w = createWheelScaler(() => t);
  assert.equal(w.push(-400, 0, 3.98), 4);
  assert.equal(w.push(400, 0, 0.52), 0.5);
  t = 0;
  assert.equal(w.push(-30, 0, 1), null);
  t = 1000;
  assert.equal(w.push(-30, 0, 1), null, "earlier 30px expired");
  assert.equal(w.push(0, 0, 1), null);
  assert.equal(w.push(NaN, 0, 1), null);
});
