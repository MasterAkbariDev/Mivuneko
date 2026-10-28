import test from "node:test";
import assert from "node:assert/strict";
import {
  characterFor,
  withMouth,
  clampPosition,
  recoverPosition,
  walkStep,
  shouldCheckIn,
} from "../../packages/character/controller.ts";
import { validateVrmFile } from "../../packages/character/packs.ts";
test("expressions do not replace body/speech activity", () => {
  assert.equal(characterFor("speaking", "sit").body, "sit");
  assert.equal(characterFor("speaking").activity, "speaking");
  assert.equal(characterFor("concerned", "walk").body, "idle");
});
test("mouth only moves while speaking and amplitude is bounded", () => {
  assert.equal(withMouth(characterFor("idle"), 1).mouth, 0);
  assert.equal(withMouth(characterFor("speaking"), 5).mouth, 1);
  assert.equal(withMouth(characterFor("speaking"), NaN).mouth, 0);
});
test("monitor coordinates support negative desktop origins", () => {
  assert.deepEqual(
    clampPosition(
      { x: -5000, y: 900 },
      { width: 320, height: 480 },
      { x: -1920, y: 0, width: 1920, height: 1080 },
    ),
    { x: -1920, y: 600 },
  );
});
test("unplugged monitor recovers into remaining work area", () => {
  assert.deepEqual(
    recoverPosition({ x: 4000, y: 900 }, { width: 320, height: 480 }, [
      {
        id: "main",
        scale: 1.5,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]),
    { x: 1600, y: 600 },
  );
});
test("roaming turns at the boundary without overshoot", () => {
  assert.deepEqual(walkStep(99, 1, 0.1, 40, 0, 100), { x: 100, direction: -1 });
  assert.equal(walkStep(0, 1, 2000, 40, 0, 100).x, 4);
});
const base = {
  enabled: true,
  now: 3600000,
  lastInteraction: 0,
  lastPrompt: 0,
  unanswered: false,
  focus: false,
  fullscreen: false,
  quietHours: false,
  todayCount: 0,
  maxPerDay: 2,
  intervalMs: 600000,
};
test("check-ins are opt-in, bounded, and respect quiet context", () => {
  assert.equal(shouldCheckIn(base), true);
  for (const patch of [
    { enabled: false },
    { focus: true },
    { fullscreen: true },
    { quietHours: true },
    { unanswered: true },
    { todayCount: 2 },
    { lastInteraction: 3599999 },
  ])
    assert.equal(shouldCheckIn({ ...base, ...patch }), false);
});
test("VRM input rejects wrong format, empty and oversized files", () => {
  assert.throws(() => validateVrmFile("x.glb", 12));
  assert.throws(() => validateVrmFile("x.vrm", 0));
  assert.throws(() => validateVrmFile("x.vrm", 51 * 1024 * 1024));
  assert.doesNotThrow(() => validateVrmFile("x.vrm", 1024));
});
