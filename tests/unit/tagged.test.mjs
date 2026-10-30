import { test } from "node:test";
import assert from "node:assert/strict";
import { taggedProgress } from "../../packages/shared-schemas/tagged.ts";

const reply =
  '@meta emotion=happy\nHello there!\nI\'ll walk left now.\n@actions {"companionActions":[{"kind":"move","gait":"walk","destination":"left"}],"appQuery":""}';

test("header sets the emotion and is never shown", () => {
  const p = taggedProgress(reply);
  assert.equal(p.emotion, "happy");
  assert.equal(p.visible, "Hello there!\nI'll walk left now.");
});

test("no prefix of the stream ever reveals a tag", () => {
  for (let i = 0; i <= reply.length; i++) {
    const { visible } = taggedProgress(reply.slice(0, i));
    assert.ok(!/@|meta|actions|companionActions/.test(visible), visible);
  }
});

test("emotion is known before any body text", () => {
  const header = "@meta emotion=sad\n";
  assert.equal(taggedProgress(header).emotion, "sad");
  assert.equal(taggedProgress(header).visible, "");
  assert.equal(taggedProgress("@meta emo").visible, "");
});

test("missing or invalid header falls back safely", () => {
  assert.deepEqual(taggedProgress("Plain reply."), { visible: "Plain reply." });
  assert.equal(taggedProgress("@meta emotion=furious\nHi").emotion, undefined);
  assert.equal(taggedProgress("@meta emotion=furious\nHi").visible, "Hi");
  assert.equal(taggedProgress("@meta emotion=SAD\nHi").emotion, "sad");
});

test("lines inside code fences are text, even if they start with @", () => {
  const raw = "@meta emotion=curious\nExample:\n```js\n@decorator\n```\nDone.";
  assert.equal(
    taggedProgress(raw).visible,
    "Example:\n```js\n@decorator\n```\nDone.",
  );
});

test("a complete ordinary @ line is shown once its newline arrives", () => {
  assert.equal(
    taggedProgress("@meta emotion=happy\n@home is cosy").visible,
    "",
  );
  assert.equal(
    taggedProgress("@meta emotion=happy\n@home is cosy\n").visible,
    "@home is cosy\n",
  );
});

import { parseAgentReply } from "../../packages/shared-schemas/agent.ts";
test("an invalid action plan drops the actions, not the reply", () => {
  const reply = parseAgentReply(
    JSON.stringify({
      text: "Sure, moving!",
      emotion: "happy",
      companionActions: [{ kind: "teleport" }],
    }),
  );
  assert.equal(reply.text, "Sure, moving!");
  assert.equal(reply.mood, "happy");
  assert.deepEqual(reply.companionActions, []);
});
