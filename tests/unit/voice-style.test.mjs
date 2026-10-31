import test from "node:test";
import assert from "node:assert/strict";
import {
  deliveryFor,
  splitSpeech,
  voiceMood,
} from "../../packages/shared-schemas/voice-style.ts";
const pack = {
  engine: "kokoro",
  speed: 0.86,
  gain: 1,
  moods: { sad: { speed: 0.9, pause: 1.5, gain: 0.9 } },
};
test("phrases get human-sized pauses and none trails the last one", () => {
  const p = splitSpeech("Hello there! How are you? I'm fine, thanks.");
  assert.deepEqual(
    p.map((x) => x.text),
    ["Hello there!", "How are you?", "I'm fine, thanks."],
  );
  assert.deepEqual(
    p.map((x) => x.pauseMs),
    [420, 520, 0],
  );
  assert.deepEqual(splitSpeech("   "), []);
  assert.deepEqual(splitSpeech("..."), []);
});
test("long run-ons break at commas and ellipses pause longer", () => {
  const long = "one two three four five, ".repeat(12).trim();
  const p = splitSpeech(long, 60);
  assert.ok(p.length > 2 && p.every((x) => x.text.length <= 70));
  assert.ok(
    splitSpeech("Well… maybe. Sure.")[0].pauseMs >
      splitSpeech("Well. Maybe.")[0].pauseMs,
  );
});
test("mood changes tempo, loudness and pauses; the pack can override the defaults", () => {
  const idle = deliveryFor("idle", pack),
    sad = deliveryFor("sad", pack),
    happy = deliveryFor("happy", pack);
  assert.equal(idle.speed, 0.86);
  assert.ok(sad.speed < idle.speed && idle.speed < happy.speed);
  assert.ok(
    sad.pauseScale > idle.pauseScale && idle.pauseScale > happy.pauseScale,
  );
  assert.ok(sad.gain < happy.gain);
  assert.equal(
    sad.speed,
    0.86 * 0.9,
    "pack mood overrides the built-in default",
  );
  assert.deepEqual(deliveryFor("unknown-mood", pack), idle);
});
test("delivery stays inside safe bounds", () => {
  const d = deliveryFor("celebrating", { ...pack, speed: 9, gain: 9 });
  assert.ok(d.speed <= 1.6 && d.gain <= 1.5);
  assert.ok(deliveryFor("sad", { ...pack, speed: 0.01 }).speed >= 0.5);
});
test("emotions without their own mood borrow the closest one", () => {
  assert.equal(voiceMood("excited"), "celebrating");
  assert.equal(voiceMood("crying"), "sad");
  assert.equal(voiceMood("angry"), "angry");
  assert.deepEqual(deliveryFor("crying", pack), deliveryFor("sad", pack));
  assert.ok(
    deliveryFor("excited", pack).speed > deliveryFor("idle", pack).speed,
  );
});
