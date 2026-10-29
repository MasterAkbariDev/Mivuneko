import test from "node:test";
import assert from "node:assert/strict";
import { desktopIntent } from "../../packages/shared-schemas/desktop-intent.ts";
import { parseCompanionActions } from "../../packages/shared-schemas/pet-actions.ts";
test("mood and conversational distraction requests compile to actual companion actions", () => {
  for (const [text, expression] of [
    ["cry", "crying"],
    ["love me", "love"],
    ["look sleepy", "sleeping"],
    ["be happy", "happy"],
    ["show love", "love"],
    ["reset your mood", "auto"],
  ])
    assert.deepEqual(desktopIntent(text), { kind: "expression", expression });
  assert.equal(
    desktopIntent("you are interrupting me go outside of my screen")?.kind,
    "hide",
  );
  assert.equal(
    desktopIntent("you are distracting me")?.destination,
    "unobtrusive",
  );
  assert.equal(desktopIntent("stand up now")?.kind, "stand");
});
test("LLM action plans are atomic and cannot request OS tools", () => {
  assert.equal(
    parseCompanionActions([
      { kind: "move", gait: "walk", destination: "left" },
      { kind: "sit" },
      { kind: "expression", expression: "crying" },
    ]).length,
    3,
  );
  assert.throws(() =>
    parseCompanionActions([
      { kind: "stand" },
      { kind: "shell", command: "anything" },
    ]),
  );
  assert.throws(() =>
    parseCompanionActions([
      { kind: "move", gait: "walk", destination: "file:///x" },
    ]),
  );
  assert.throws(() =>
    parseCompanionActions(Array.from({ length: 9 }, () => ({ kind: "stand" }))),
  );
});
