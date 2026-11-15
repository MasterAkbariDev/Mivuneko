import test from "node:test";
import assert from "node:assert/strict";
import {
  requestedFolder,
  fileTask,
  taskWithContext,
} from "../../packages/shared-schemas/task-context.ts";
import { gestureConfig } from "../../packages/shared-schemas/procedural-gesture.ts";
import { parseCompanionActions } from "../../packages/shared-schemas/pet-actions.ts";
import { chooseRestSurface } from "../../packages/shared-schemas/rest-surface.ts";
import { vrmFace } from "../../packages/character/expressions.ts";
test("an explicit folder creates a file task without an editor requirement", () => {
  const request =
    'hey luna can you create a closure function example on this directory: "J:/Projects/jsPractice/closure/"';
  assert.equal(requestedFolder(request), "J:/Projects/jsPractice/closure");
  assert.equal(fileTask(request), true);
  assert.equal(
    requestedFolder(
      'save a note in "J:\\Projects\\notes with spaces\\entry.txt"',
    ),
    "J:/Projects/notes with spaces",
  );
});
test("a deictic app clarification keeps the original goal while unrelated tasks start fresh", () => {
  const goal = 'Create a closure example in "J:/Projects/jsPractice/closure/"';
  const followup = taskWithContext("use notepad for that matter", goal);
  assert.ok(followup.includes(goal));
  assert.ok(followup.includes("notepad"));
  assert.equal(requestedFolder(followup), "J:/Projects/jsPractice/closure");
  assert.equal(
    taskWithContext("Open https://www.mozilla.org/", goal),
    "Open https://www.mozilla.org/",
  );
});
test("taskbar lying uses the rendered bottom and remains available to oversized characters", () => {
  const surface = {
    id: "taskbar",
    kind: "taskbar",
    left: 0,
    right: 1920,
    y: 1040,
  };
  const seat = chooseRestSurface(
    [surface],
    { x: 500, y: 0 },
    { width: 1000, height: 2500 },
    { x: 0, y: 0, width: 1920, height: 1040 },
    1400,
    { top: 100, bottom: 2400 },
    "lie",
  );
  assert.ok(seat);
  assert.equal(seat.point.y + 2400, 1040);
});
test("procedural gestures are bounded, composable and new expressions are unique", () => {
  const g = gestureConfig({
    arms: "raised",
    head: "bow",
    intensity: 9,
    tempo: 9,
    duration: 99,
  });
  assert.equal(g.intensity, 1);
  assert.equal(g.tempo, 2);
  assert.equal(g.duration, 12);
  assert.equal(
    gestureConfig({ arms: "run arbitrary code", head: "nod" }),
    null,
  );
  assert.equal(
    parseCompanionActions([
      {
        kind: "gesture",
        arms: "open",
        head: "tilt",
        intensity: 0.4,
        tempo: 0.7,
        duration: 3,
      },
    ])[0].kind,
    "gesture",
  );
  const faces = ["bored", "nervous", "relieved", "embarrassed"].map((x) =>
    JSON.stringify(vrmFace(x)),
  );
  assert.equal(new Set(faces).size, 4);
});
