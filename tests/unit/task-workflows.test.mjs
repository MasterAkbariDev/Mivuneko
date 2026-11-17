import {
  workContext,
  updateWorkContext,
} from "../../packages/shared-schemas/work-context.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {
  requestedFolder,
  fileTask,
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
test("task memory keeps confirmed scope and pending questions across lifecycle updates", () => {
  const initial = workContext({
    request: "Write a note in the project",
    goal: "Write a note",
    workspace: "J:/Projects/notes",
    status: "working",
    facts: ["Created note.txt"],
  });
  const pending = updateWorkContext(initial, {
    status: "waiting",
    question: "Which format?",
  });
  assert.equal(pending.workspace, initial.workspace);
  assert.equal(pending.request, initial.request);
  assert.deepEqual(pending.facts, initial.facts);
  const completed = updateWorkContext(pending, {
    status: "completed",
    question: "",
    facts: Array.from({ length: 10 }, (_, i) => "Result " + i),
  });
  assert.equal(completed.facts.length, 6);
  assert.equal(completed.facts.at(-1), "Result 9");
  assert.equal(completed.question, "");
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

test("terminal tasks use explicit folders and retain only relevant follow-up context", () => {
  const goal =
    'open vscode for me on a new directory of "J:/Projects/JSPractice"';
  assert.equal(fileTask(goal), true);
  assert.equal(fileTask('run npm test in "J:/Projects/JSPractice"'), true);
  const other = 'run git status in "J:/Projects/other"';
  assert.equal(fileTask(other), true);
  assert.equal(requestedFolder(other), "J:/Projects/other");
});

import {
  appWindowQuery,
  computerIntent,
} from "../../packages/shared-schemas/computer-intent.ts";
test("app status questions are admitted to semantic task preparation", () => {
  const request = "hey haru can you check if my vscode is open?";
  assert.equal(appWindowQuery(request), "vscode");
  assert.equal(computerIntent(request), true);
  assert.equal(appWindowQuery("how do I check if vscode is open?"), null);
  assert.equal(appWindowQuery("check if vscode is open and write code"), null);
  assert.equal(appWindowQuery("is my editor running?"), "editor");
});
