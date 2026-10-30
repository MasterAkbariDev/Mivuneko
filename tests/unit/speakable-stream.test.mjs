import { test } from "node:test";
import assert from "node:assert/strict";
import {
  speakable,
  speakableStream,
} from "../../packages/shared-schemas/speech.ts";

const corpus = [
  "Hello there, it is lovely to see you. I found a quiet spot on your desk! Want to chat?",
  "Sure! A closure is a function that remembers its scope.\n\n```js\nfunction counter() {\n  let n = 0;\n  return () => ++n;\n}\n```\n\nEach call to `counter()` gets its own **n**. See https://developer.mozilla.org/closures",
  "# Plan\n- first thing\n- second thing\n\n1. Wake up.\n2. Stretch.\n3. Coffee.",
  "Here are the planets:\n\n| Planet | Moons |\n| --- | --- |\n| Earth | 1 |\n| Mars | 2 |\n\nThat is all for now.",
  "Version 3.14 is out. Visit www.example.com today… or not?",
];
const norm = (s) => s.replace(/\s+/g, " ").trim();

function stream(text, step) {
  const next = speakableStream();
  const out = [];
  for (let i = step; i < text.length + step; i += step) {
    const said = next(text.slice(0, Math.min(i, text.length)));
    if (said) out.push(said);
  }
  const rest = next(text, true);
  if (rest) out.push(rest);
  return out;
}

test("streamed speech says what the whole reply says, at every chunk size", () => {
  for (const text of corpus)
    for (const step of [1, 2, 3, 7, 16, 50])
      assert.equal(
        norm(stream(text, step).join(" ")),
        norm(speakable({ text })),
        `step ${step}: ${text.slice(0, 30)}`,
      );
});

test("no streamed segment speaks raw code, table pipes or a bare list number", () => {
  for (const text of corpus)
    for (const step of [1, 4, 9])
      for (const segment of stream(text, step)) {
        assert.ok(!/```|function counter|\|/.test(segment), segment);
        assert.ok(!/^\d+\.$/.test(segment.trim()), segment);
      }
});

test("the first sentence is released before the reply finishes", () => {
  const next = speakableStream();
  assert.equal(next("Hello there, it is lovely"), "");
  assert.equal(
    next("Hello there, it is lovely to see you. I found"),
    "Hello there, it is lovely to see you.",
  );
  assert.equal(
    next("Hello there, it is lovely to see you. I found a spot.", true),
    "I found a spot.",
  );
});

test("an open code block is held until it closes", () => {
  const next = speakableStream();
  const head = "Look:\n```js\nlet x = 1;\n";
  assert.equal(next(head), "Look:");
  assert.equal(next(head + "let y = 2;\n"), "");
  assert.match(next(head + "let y = 2;\n```\nDone.\n"), /code example/);
});

test("the final reply text continues the stream without repeating it", () => {
  const next = speakableStream();
  assert.equal(next("\nHello there. How are"), "Hello there.");
  // The finished reply is trimmed and may arrive before the last streamed delta.
  assert.equal(
    next("Hello there. How are you today?", true),
    "How are you today?",
  );
  assert.equal(next("Something unrelated.", true), "");
});
