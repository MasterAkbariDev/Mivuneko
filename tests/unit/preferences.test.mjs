import test from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  parsePreferences,
} from "../../packages/shared-schemas/preferences.ts";
import { validateVrmBytes } from "../../packages/character/packs.ts";
test("preferences default to quiet, no audio and stationary", () => {
  assert.equal(defaults.proactive, false);
  assert.equal(defaults.voice, "off");
  assert.equal(defaults.movement, "stationary");
  assert.deepEqual(parsePreferences(null), defaults);
});
test("malformed persisted preferences fail safely", () => {
  const p = parsePreferences({
    character: "bad",
    voice: "always-listen",
    proactive: "yes",
    volume: Infinity,
    monitor: 5,
  });
  assert.equal(p.character, "luna");
  assert.equal(p.voice, "off");
  assert.equal(p.proactive, false);
  assert.equal(p.volume, 0.7);
  assert.equal(p.monitor, "current");
});
test("legacy models migrate to Luna while new characters and voice styles persist", () => {
  for (const character of ["sample-vrm", "local-vrm", "chibi", "mock-cat"])
    assert.equal(parsePreferences({ character }).character, "luna");
  for (const character of ["miku", "kitsune", "stella"])
    assert.equal(parsePreferences({ character }).character, character);
  assert.equal(
    parsePreferences({ localVoiceStyle: "bright" }).localVoiceStyle,
    "bright",
  );
  assert.equal(
    parsePreferences({
      localVoiceStyle: "multilingual",
      localVoiceLanguage: "ja",
    }).localVoiceLanguage,
    "ja",
  );
  assert.equal(
    parsePreferences({ localVoiceStyle: "bad", localVoiceLanguage: "bad" })
      .localVoiceStyle,
    "natural",
  );
});
function glb(data) {
  const raw = new TextEncoder().encode(JSON.stringify(data));
  const n = Math.ceil(raw.length / 4) * 4;
  const bytes = new ArrayBuffer(20 + n),
    view = new DataView(bytes);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, n, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(bytes, 20).fill(32);
  new Uint8Array(bytes, 20, raw.length).set(raw);
  return bytes;
}
test("VRM container validation rejects remote resources", () => {
  assert.throws(() => validateVrmBytes(new ArrayBuffer(4)));
  assert.throws(() =>
    validateVrmBytes(
      glb({
        extensions: { VRMC_vrm: {} },
        images: [{ uri: "https://example.com/x.png" }],
      }),
    ),
  );
  assert.doesNotThrow(() =>
    validateVrmBytes(
      glb({ extensions: { VRMC_vrm: {} }, images: [{ bufferView: 0 }] }),
    ),
  );
});
