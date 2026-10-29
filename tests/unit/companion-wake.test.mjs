import test from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../../packages/shared-schemas/preferences.ts";
import { wakeCompanion } from "../../packages/shared-schemas/companion-wake.ts";
import { desktopIntent } from "../../packages/shared-schemas/desktop-intent.ts";
test("waking clears every sleep override without altering size or position preferences", () => {
  const p = {
    ...defaults,
    petMode: "sleep",
    petExpression: "sleeping",
    customPackPose: "sleeping",
    petScale: 6,
    petAvoiding: true,
  };
  const awake = { ...p, ...wakeCompanion(p) };
  assert.equal(awake.petMode, "stand");
  assert.equal(awake.petExpression, "auto");
  assert.equal(awake.customPackPose, "");
  assert.equal(awake.petScale, 6);
  assert.equal(awake.petAvoiding, true);
  assert.deepEqual(
    wakeCompanion({ ...defaults, petMode: "walk", petExpression: "love" }),
    {},
  );
});
test("wake and sleep commands have deterministic local actions", () => {
  for (const phrase of [
    "wake up",
    "please wake up",
    "get up",
    "rise and shine",
  ])
    assert.deepEqual(desktopIntent(phrase), { kind: "stand" });
  assert.deepEqual(desktopIntent("go to sleep"), {
    kind: "expression",
    expression: "sleeping",
  });
});
