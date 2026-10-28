import test from "node:test";
import assert from "node:assert/strict";
import { cleanTranscript } from "../../packages/shared-schemas/transcript.ts";
test("non-speech tags are removed", () => {
  for (const tag of [
    "[BLANK_AUDIO]",
    "[ Silence ]",
    "(music)",
    "[MUSIC]",
    "*laughs*",
    "♪ la la ♪",
    ">>",
  ])
    assert.equal(cleanTranscript(tag), "");
  assert.equal(
    cleanTranscript("[BLANK_AUDIO] how are you (music)"),
    "how are you",
  );
  assert.equal(cleanTranscript(">> open Safari"), "open Safari");
});
test("stock hallucinations are dropped only when they are the whole result", () => {
  for (const text of [
    "Thank you.",
    "Thanks for watching!",
    "Thank you for watching.",
    "Subtitles by the Amara.org community",
    "you",
    ".",
    "Bye.",
  ])
    assert.equal(cleanTranscript(text), "");
  assert.equal(
    cleanTranscript("Thank you for the help with this"),
    "Thank you for the help with this",
  );
});
test("whitespace and looping phrases collapse", () => {
  assert.equal(cleanTranscript("  how   are\nyou "), "how are you");
  assert.equal(
    cleanTranscript("open the door open the door open the door open the door"),
    "open the door",
  );
  assert.equal(cleanTranscript("go home go home"), "go home go home");
  assert.equal(
    cleanTranscript("see you see you see you later"),
    "see you see you see you later",
  );
});
