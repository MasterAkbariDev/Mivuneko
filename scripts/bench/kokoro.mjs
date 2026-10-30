// Kokoro latency: per-phrase CLI vs resident worker (stdin protocol).
// Usage: node scripts/bench/kokoro.mjs <sherpa-onnx-offline-tts or -> <worker command as JSON array or -> <kokoro model dir>
import { spawn, spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
const [cli, workerJson, m] = process.argv.slice(2);
const phrases = [
  "Hello there, it's nice to see you again.",
  "I found three apps that match.",
  "Let's take a short break and stretch.",
  "That sounds like a great idea!",
  "Okay, I'll walk to the left side now.",
];
const out = {};
if (cli !== "-") {
  out.cli = phrases.map((p) => {
    const f = path.join(os.tmpdir(), "k.wav");
    const t = performance.now();
    const r = spawnSync(cli, [
      `--kokoro-model=${m}/model.onnx`,
      `--kokoro-voices=${m}/voices.bin`,
      `--kokoro-tokens=${m}/tokens.txt`,
      `--kokoro-data-dir=${m}/espeak-ng-data`,
      `--kokoro-lexicon=${m}/lexicon-us-en.txt`,
      "--sid=3",
      "--num-threads=4",
      `--output-filename=${f}`,
      "--",
      p,
    ]);
    if (r.status !== 0) throw Error(r.stderr.toString().slice(-300));
    return Math.round(performance.now() - t);
  });
}
if (workerJson !== "-") {
  const [cmd, ...args] = JSON.parse(workerJson);
  const t0 = performance.now();
  const w = spawn(cmd, args, { stdio: ["pipe", "pipe", "inherit"] });
  let buf = Buffer.alloc(0);
  const waiters = [];
  w.stdout.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    while (waiters.length && waiters[0]()) waiters.shift();
  });
  const line = () =>
    new Promise(
      (res) =>
        waiters.push(() => {
          const i = buf.indexOf(10);
          if (i < 0) return false;
          const l = buf.subarray(0, i).toString();
          buf = buf.subarray(i + 1);
          res(l);
          return true;
        }) && waiters[0](),
    );
  const bytes = (n) =>
    new Promise(
      (res) =>
        waiters.push(() => {
          if (buf.length < n) return false;
          buf = buf.subarray(n);
          res();
          return true;
        }) && waiters[0](),
    );
  const ready = await line();
  out.coldLoadMs = Math.round(performance.now() - t0);
  out.ready = ready;
  out.worker = [];
  for (const p of phrases) {
    const t = performance.now();
    const b = Buffer.from(p);
    w.stdin.write(`GEN 3 1.000 ${b.length}\n`);
    w.stdin.write(b);
    const h = await line();
    if (!h.startsWith("OK ")) throw Error(h);
    await bytes(Number(h.slice(3)));
    out.worker.push(Math.round(performance.now() - t));
  }
  w.kill();
}
console.log(JSON.stringify(out));
