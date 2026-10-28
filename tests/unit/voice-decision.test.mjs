import test from "node:test";
import assert from "node:assert/strict";
import { voiceDecision } from "../../packages/shared-schemas/voice-decision.ts";
import { parsePreferences } from "../../packages/shared-schemas/preferences.ts";

test("voice decisions require an exact unambiguous phrase", () => {
  for (const word of ["approve", "YES!", "allow once."])
    assert.equal(voiceDecision(word), true);
  for (const word of ["deny", "No.", "cancel"])
    assert.equal(voiceDecision(word), false);
  for (const phrase of ["do not approve", "yes and no", "maybe", "not now", ""])
    assert.equal(voiceDecision(phrase), null);
});
test("approval mode defaults to asking and accepts explicit opt-in", () => {
  assert.equal(parsePreferences(null).approvalMode, "ask");
  assert.equal(parsePreferences({ approvalMode: "auto" }).approvalMode, "auto");
  assert.equal(parsePreferences({ approvalMode: "deny" }).approvalMode, "deny");
  assert.equal(
    parsePreferences({ approvalMode: "invalid" }).approvalMode,
    "ask",
  );
});
