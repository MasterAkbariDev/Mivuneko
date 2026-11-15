import test from "node:test";
import assert from "node:assert/strict";
import {
  applyVoiceDelivery,
  deliverySelection,
  voiceDeliveries,
} from "../../packages/shared-schemas/voice-performance.ts";
test("voice delivery keeps character identity and replaces its own previous direction", () => {
  let text = "Haru has a warm voice.";
  for (const key of Object.keys(voiceDeliveries)) {
    text = applyVoiceDelivery(text, key);
    assert.equal(deliverySelection(text), key);
    assert.ok(text.startsWith("Haru has a warm voice."));
    assert.equal(text.split("Delivery style:").length, 2);
  }
  assert.equal(deliverySelection("A custom voice"), "custom");
  assert.ok(applyVoiceDelivery("x".repeat(1600), "dramatic").length <= 1000);
});
