import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePreferences } from "../../packages/shared-schemas/preferences.ts";
import { parseAgentReply } from "../../packages/shared-schemas/agent.ts";
import { characters } from "../../apps/desktop/src/lunaModel.ts";
test("Gemini preferences retain no supplied credentials and check-ins remain opt-in", () => {
  const prefs = parsePreferences({
    backend: "gemini",
    voiceProvider: "gemini",
    keys: ["secret"],
    proxy: "socks5h://secret",
  });
  assert.equal(prefs.backend, "auto");
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
test("all illustrated companions provide transparent atlases and unique expression cells", () => {
  for (const id of Object.keys(characters)) {
    const character = characters[id];
    const bytes = readFileSync(
      new URL(
        `../../apps/desktop/public${character.atlases[0]}`,
        import.meta.url,
      ),
    );
    assert.equal(bytes.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.ok(bytes.readUInt32BE(16) >= 1000);
    assert.ok(bytes.readUInt32BE(20) >= 1000);
    assert.equal(bytes[25], 6, "atlas must carry an alpha channel");
    assert.equal(
      new Set(Object.values(character.poses).map((v) => v.join(":"))).size,
      Object.keys(character.poses).length,
    );
    for (const pose of Object.keys(characters.luna.poses)) {
      const [atlas, column, row] = character.poses[pose];
      assert.ok(atlas >= 0 && atlas < character.atlases.length);
      assert.ok(
        column >= 0 &&
          column < (character.columns ?? 3) &&
          row >= 0 &&
          row < (character.rows ?? 2),
      );
    }
  }
});
test("Luna expression choices each use a unique sprite cell", () => {
  const frames = Object.values(characters.luna.poses).map((pose) =>
    pose.join(":"),
  );
  assert.equal(new Set(frames).size, frames.length);
});
