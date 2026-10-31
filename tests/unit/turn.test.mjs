import test from "node:test";
import assert from "node:assert/strict";
import {
  BARGE_IN_MS,
  echoOfSpoken,
  looksFinished,
} from "../../packages/shared-schemas/turn.ts";
const spoken =
  "Sure! A closure is a function that remembers the variables around it, even after the outer function has finished.";
test("her own voice coming back through the mic is recognised", () => {
  assert.ok(echoOfSpoken("a closure is a function that remembers", spoken));
  assert.ok(echoOfSpoken("Remembers the variables around it.", spoken));
});
test("a real interruption is not mistaken for an echo", () => {
  assert.ok(!echoOfSpoken("stop, open Safari please", spoken));
  assert.ok(!echoOfSpoken("what about a closure in Python", spoken));
});
test("a single word or empty text is never dropped as an echo", () => {
  assert.ok(!echoOfSpoken("function", spoken));
  assert.ok(!echoOfSpoken("", spoken));
  assert.ok(!echoOfSpoken("hello there", ""));
});
test("interruptions need a sustained burst of speech", () => {
  assert.ok(BARGE_IN_MS >= 300 && BARGE_IN_MS <= 600);
});
test("finished sentences are recognised; open ones are not", () => {
  for (const text of [
    "Tell me a joke.",
    "What can you do?",
    "open Safari",
    "یه جوک بگو.",
    "ساعت چنده؟",
  ])
    assert.ok(looksFinished(text), text);
  for (const text of [
    "I want to",
    "open Safari and",
    "Well, so...",
    "Tell me,",
    "I was thinking…",
    "می‌خوام که",
    "",
  ])
    assert.ok(!looksFinished(text), text);
});
