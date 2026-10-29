import test from "node:test";
import assert from "node:assert/strict";
import { vrmFace } from "../../packages/character/expressions.ts";
import { desktopIntent } from "../../packages/shared-schemas/desktop-intent.ts";
test("expressive faces use distinct blends rather than duplicate mood presets", () => {
  const moods = [
    "happy",
    "sad",
    "crying",
    "concerned",
    "angry",
    "determined",
    "surprised",
    "curious",
    "thinking",
    "confused",
    "shy",
    "love",
    "teasing",
    "joking",
    "wink",
    "proud",
    "sleeping",
    "celebrating",
    "excited",
  ];
  assert.equal(
    new Set(moods.map((m) => JSON.stringify(vrmFace(m)))).size,
    moods.length,
  );
  assert.ok(vrmFace("crying").sad > vrmFace("sad").sad);
  assert.ok(vrmFace("sleeping").blinkLeft > 0.5);
});
test("natural freedom requests resume automatic behavior", () => {
  for (const text of [
    "be free",
    "move freely",
    "do your own thing",
    "roam freely",
    "you are free",
    "resume free roaming",
  ])
    assert.equal(desktopIntent(text)?.kind, "automatic", text);
});
