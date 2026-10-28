import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { vrmFace, vrmEffect } from "../../packages/character/expressions.ts";
const bytes = readFileSync(
  new URL("../../apps/desktop/public/models/haru.vrm", import.meta.url),
);
const gltf = JSON.parse(
  bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"),
);
const vrm = gltf.extensions.VRMC_vrm;
test("bundled character retains verified provenance, facial morphs, gaze and spring physics", () => {
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "ffbd8c92a9e67c0a948f69c7a2eec91e5c282c9ae70e9184309fc164d74cbc27",
  );
  assert.equal(vrm.meta.name, "AvatarSample_B");
  assert.ok(vrm.meta.authors.includes("VRoid Project"));
  assert.equal(vrm.meta.allowRedistribution, true);
  assert.ok(vrm.lookAt);
  assert.ok(gltf.extensions.VRMC_springBone.springs.length > 0);
  for (const name of [
    "happy",
    "sad",
    "angry",
    "surprised",
    "relaxed",
    "aa",
    "blink",
    "blinkLeft",
    "blinkRight",
  ]) {
    assert.ok(
      vrm.expressions.preset[name].morphTargetBinds.length > 0,
      `${name} needs a real facial binding`,
    );
  }
});
test("every expressive mood uses morphs supported by the bundled character", () => {
  for (const mood of [
    "idle",
    "happy",
    "angry",
    "sad",
    "surprised",
    "shy",
    "curious",
    "confused",
    "love",
    "wink",
    "sleeping",
    "celebrating",
    "thinking",
    "determined",
    "concerned",
    "joking",
    "teasing",
    "excited",
    "proud",
    "crying",
  ]) {
    for (const [preset, value] of Object.entries(vrmFace(mood))) {
      assert.ok(
        vrm.expressions.preset[preset],
        `${mood}: unsupported expression ${preset}`,
      );
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
    }
    if (!["idle"].includes(mood))
      assert.ok(vrmEffect(mood), `${mood} should have an effect`);
  }
});
