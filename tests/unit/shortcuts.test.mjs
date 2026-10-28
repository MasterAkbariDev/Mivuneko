import test from "node:test";
import assert from "node:assert/strict";
import {
  shortcutFor,
  matchesShortcut,
} from "../../packages/shared-schemas/shortcuts.ts";
import { parsePreferences } from "../../packages/shared-schemas/preferences.ts";
test("shortcuts distinguish modifiers and ignore letter case", () => {
  const event = {
    key: "k",
    ctrlKey: true,
    shiftKey: true,
    altKey: false,
    metaKey: false,
  };
  assert.equal(shortcutFor(event), "Ctrl+Shift+K");
  assert.ok(matchesShortcut(event, "Ctrl+Shift+K"));
  assert.ok(!matchesShortcut({ ...event, shiftKey: false }, "Ctrl+Shift+K"));
  assert.equal(shortcutFor({ ...event, key: "Control" }), "");
});
test("device and renderer preferences are bounded and retained", () => {
  const prefs = parsePreferences({
    microphoneId: "usb-mic",
    renderer: "custom-vrm",
    noiseSuppression: false,
    textScale: 9,
  });
  assert.equal(prefs.microphoneId, "usb-mic");
  assert.equal(prefs.renderer, "custom-vrm");
  assert.equal(prefs.noiseSuppression, false);
  assert.equal(prefs.textScale, 1.25);
  assert.equal(parsePreferences({ renderer: "remote-url" }).renderer, "2d");
});
