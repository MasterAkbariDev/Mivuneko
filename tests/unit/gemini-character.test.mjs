import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parsePreferences } from "../../packages/shared-schemas/preferences.ts";
import { parseAgentReply } from "../../packages/shared-schemas/agent.ts";
import { inspectVrm } from "../../packages/character/packs.ts";
test("Gemini preferences retain no supplied credentials and check-ins remain opt-in", () => {
  const prefs = parsePreferences({
    backend: "gemini",
    voiceProvider: "gemini",
    keys: ["secret"],
    proxy: "socks5h://secret",
  });
  assert.equal(prefs.backend, "gemini");
  assert.equal(prefs.voiceProvider, "gemini");
  assert.equal(prefs.voice, "off");
  assert.equal(prefs.proactive, false);
  assert.equal(prefs.spokenCheckins, false);
  assert.ok(!JSON.stringify(prefs).includes("secret"));
});
test("character JSON accepts expression cues and bounded proposals", () => {
  for (const emotion of ["angry", "sad", "surprised"])
    assert.equal(
      parseAgentReply(JSON.stringify({ text: "Hello", emotion })).mood,
      emotion,
    );
  assert.equal(
    parseAgentReply(
      JSON.stringify({
        text: "Approval needed",
        emotion: "curious",
        appQuery: "Calculator",
      }),
    ).appQuery,
    "Calculator",
  );
  assert.equal(
    parseAgentReply(
      JSON.stringify({
        text: "Hello",
        emotion: "unknown",
        appQuery: "a".repeat(201),
      }),
    ).appQuery,
    undefined,
  );
});
test("bundled expressive model matches recorded provenance and advertises required morphs", () => {
  const bytes = readFileSync(
    new URL(
      "../../apps/desktop/public/models/pixiv-expression-sample.vrm",
      import.meta.url,
    ),
  );
  const provenance = JSON.parse(
    readFileSync(
      new URL("../../licenses/pixiv-expression-sample.json", import.meta.url),
    ),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    provenance.sha256,
  );
  const info = inspectVrm(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  assert.equal(info.authors, "pixiv Inc.");
  for (const expression of [
    "angry",
    "sad",
    "happy",
    "surprised",
    "blink",
    "aa",
  ])
    assert.ok(info.expressions.includes(expression));
  assert.equal(provenance.metadata.allowRedistribution, true);
  assert.equal(provenance.metadata.avatarPermission, "everyone");
});
