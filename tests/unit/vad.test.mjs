import test from "node:test";
import assert from "node:assert/strict";
import { createVad } from "../../packages/shared-schemas/vad.ts";
import { resampleTo16k } from "../../packages/shared-schemas/audio.ts";
const rate = 48000,
  size = 2048;
let seed = 1;
const noise = (amp) => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed / 2 ** 32 - 0.5) * 2 * amp;
};
function frames(ms, amp, tone = 0, start = 0) {
  const total = Math.round((ms * rate) / 1000),
    out = [];
  for (let at = 0; at < total; at += size) {
    const f = new Float32Array(Math.min(size, total - at));
    for (let i = 0; i < f.length; i++)
      f[i] =
        noise(amp) +
        (tone
          ? tone * Math.sin((2 * Math.PI * 220 * (start + at + i)) / rate)
          : 0);
    out.push(f);
  }
  return out;
}
test("speech after a quiet room is detected, pre-rolled and ended", () => {
  const vad = createVad({ sampleRate: rate }),
    states = [];
  for (const f of frames(1500, 0.004)) states.push(vad.push(f));
  assert.ok(states.every((s) => s === "silence"));
  let started = -1;
  for (const f of frames(800, 0.004, 0.2, 100000)) {
    const s = vad.push(f);
    if (s === "speech" && started < 0) {
      started = 1;
      break;
    }
  }
  assert.equal(started, 1);
  const pre = vad.takePreRoll(),
    samples = pre.reduce((n, f) => n + f.length, 0);
  assert.ok(samples >= 0.4 * rate, `pre-roll too short: ${samples}`);
  let end = false;
  for (const f of frames(1200, 0.004))
    if (vad.push(f) === "end") {
      end = true;
      break;
    }
  assert.ok(end);
});
test("short clicks are ignored", () => {
  const vad = createVad({ sampleRate: rate });
  for (const f of frames(1000, 0.004)) vad.push(f);
  const click = new Float32Array(480).fill(0.5);
  assert.equal(vad.push(click), "silence");
  for (const f of frames(500, 0.004)) assert.equal(vad.push(f), "silence");
});
test("a steady noisy room raises the floor instead of triggering speech", () => {
  const vad = createVad({ sampleRate: rate }),
    states = new Set();
  for (const f of frames(4000, 0.03)) states.add(vad.push(f));
  assert.ok(!states.has("end"));
  assert.ok(vad.push(frames(100, 0.03)[0]) === "silence");
});
test("resampleTo16k returns the expected length and preserves level", () => {
  const out = resampleTo16k(new Float32Array(48000).fill(0.5), 48000);
  assert.equal(out.length, 16000);
  assert.ok(Math.abs(out[8000] - 0.5) < 1e-6);
  assert.equal(
    resampleTo16k(new Float32Array(8000).fill(0.1), 16000).length,
    8000,
  );
});
test("an utterance still ends when the mic starts with digital silence", () => {
  const vad = createVad({ sampleRate: rate });
  for (const f of frames(300, 0)) vad.push(f);
  for (const f of frames(600, 0.015)) vad.push(f);
  let speech = false,
    end = false;
  for (const f of frames(700, 0.015, 0.3, 200000))
    if (vad.push(f) === "speech") speech = true;
  for (const f of frames(1500, 0.015))
    if (vad.push(f) === "end") {
      end = true;
      break;
    }
  assert.ok(speech && end);
});
test("higher sensitivity hears quieter speech than low sensitivity", () => {
  const quiet = (sensitivity) => {
    const vad = createVad({ sampleRate: rate, sensitivity });
    for (const f of frames(800, 0.001)) vad.push(f);
    let heard = false;
    for (const f of frames(600, 0.001, 0.014, 50000))
      if (vad.push(f) === "speech") heard = true;
    return heard;
  };
  assert.equal(quiet("high"), true);
  assert.equal(quiet("low"), false);
});
test("a longer end pause keeps the utterance open through short gaps", () => {
  const run = (endSilenceMs) => {
    const vad = createVad({ sampleRate: rate, endSilenceMs });
    for (const f of frames(800, 0.004)) vad.push(f);
    for (const f of frames(500, 0.004, 0.3, 100000)) vad.push(f);
    let ended = false;
    for (const f of frames(800, 0.004)) if (vad.push(f) === "end") ended = true;
    return ended;
  };
  assert.equal(run(500), true);
  assert.equal(run(1200), false);
});

test("thinking pauses and resumed speech stay in a single turn", () => {
  const vad = createVad({ sampleRate: rate, endSilenceMs: 3500 });
  for (const f of frames(900, 0.002)) vad.push(f);
  for (const f of frames(900, 0.002, 0.2)) vad.push(f);
  for (const f of frames(2500, 0.002)) assert.notEqual(vad.push(f), "end");
  for (const f of frames(900, 0.002, 0.2)) assert.notEqual(vad.push(f), "end");
  for (const f of frames(3000, 0.002)) assert.notEqual(vad.push(f), "end");
  assert.ok(frames(600, 0.002).some((f) => vad.push(f) === "end"));
});

test("manual endpointing never sends on silence", () => {
  const vad = createVad({ sampleRate: rate, endSilenceMs: Infinity });
  for (const f of frames(900, 0.002)) vad.push(f);
  for (const f of frames(900, 0.002, 0.2)) vad.push(f);
  for (const f of frames(15000, 0.002)) assert.notEqual(vad.push(f), "end");
});
test("a floor learned earlier lets speech be heard right after a restart", () => {
  const first = createVad({ sampleRate: rate });
  for (const f of frames(1500, 0.004)) first.push(f);
  assert.ok(first.floor > 0 && first.floor < 0.02);
  const states = [],
    restarted = createVad({ sampleRate: rate, initialFloor: first.floor });
  for (const f of frames(600, 0.004, 0.2)) states.push(restarted.push(f));
  assert.ok(
    states.includes("speech"),
    "speech in the first 600 ms is not lost",
  );
  const fresh = createVad({ sampleRate: rate }),
    lost = [];
  for (const f of frames(600, 0.004, 0.2)) lost.push(fresh.push(f));
  assert.ok(!lost.includes("speech"), "a cold start still calibrates first");
});
