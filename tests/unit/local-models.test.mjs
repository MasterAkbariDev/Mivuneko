import test from "node:test";
import assert from "node:assert/strict";
import { parsePreferences } from "../../packages/shared-schemas/preferences.ts";
import {
  computerIntent,
  browserTask,
} from "../../packages/shared-schemas/computer-intent.ts";
test("local model and expressive voice settings survive parsing with bounded delivery options", () => {
  const p = parsePreferences({
    backend: "ollama",
    ollamaModel: "qwen3.5:9b",
    voiceProvider: "qwen",
    qwenSpeaker: "Serena",
    qwenInstruction: "Speak softly and thoughtfully.",
  });
  assert.equal(p.backend, "ollama");
  assert.equal(p.voiceProvider, "qwen");
  assert.equal(p.ollamaModel, "qwen3.5:9b");
  assert.equal(p.qwenSpeaker, "Serena");
  assert.equal(
    parsePreferences({ ...p, qwenInstruction: "a".repeat(3000) })
      .qwenInstruction.length,
    1000,
  );
  assert.equal(
    parsePreferences({ ...p, ollamaModel: "http://remote/model" }).ollamaModel,
    "qwen3.5:9b",
  );
});
test("explicit computer work opens a session without confusing companion movement with mouse control", () => {
  for (const prompt of [
    "use my computer to edit this document",
    "please click the save button",
    "create a file for this example",
    "organize my folder",
  ])
    assert.equal(computerIntent(prompt), true, prompt);
  for (const prompt of [
    "walk to the right",
    "go to sleep",
    "explain closures",
    "what is a file?",
  ])
    assert.equal(computerIntent(prompt), false, prompt);
});

test("browser tasks enter the conversation action flow directly", () => {
  assert.deepEqual(browserTask("open Edge and search elon musk for me"), {
    browser: "edge",
    query: "elon musk",
  });
  assert.equal(computerIntent("open Edge and search elon musk for me"), true);
  assert.equal(browserTask("explain how browsers search"), null);
});
test("character voice overrides are independent and bounded", () => {
  const p = parsePreferences({
    characterVoices: {
      haru: {
        speaker: "Serena",
        instruction: "Warm and calm",
        pronunciations: "Haru=hah roo",
      },
      luna: { speaker: "Vivian", instruction: "Bright", pronunciations: "" },
    },
  });
  assert.equal(p.characterVoices.haru.speaker, "Serena");
  assert.equal(p.characterVoices.luna.speaker, "Vivian");
});

test("website navigation is never mistaken for opening an installed app", () => {
  for (const text of [
    "open wikipedia page for me on web",
    "open wikipedia page for me on my browser",
    "please open the Wikipedia website in my default browser",
    "open wikipedia on web for me",
  ]) {
    const task = browserTask(text);
    assert.equal(computerIntent(text), true, text);
    assert.equal(task.url, "https://www.wikipedia.org/", text);
    assert.equal(task.useDefault, true);
  }
  assert.equal(
    browserTask("open example.org/docs").url,
    "https://example.org/docs",
  );
  assert.equal(browserTask("open wikipedia in Chrome").browser, "chrome");
  assert.equal(
    browserTask("open some community website in my browser").query,
    "some community",
  );
  for (const text of [
    "open Notepad",
    "go to the right",
    "open javascript:alert(1)",
    "open file:///secret.txt",
  ])
    assert.equal(browserTask(text), null, text);
});

test("browser instructions are separated from the search subject and page goals", () => {
  assert.equal(
    browserTask("search about ultron in my browser\\").query,
    "ultron",
  );
  assert.equal(
    browserTask("open elon musk description in browser").intent,
    "page",
  );
  assert.equal(
    browserTask("open elon musk description in browser").query,
    "elon musk description",
  );
  assert.equal(browserTask("open cmd.exe"), null);
  assert.equal(browserTask("open main.py"), null);
});
