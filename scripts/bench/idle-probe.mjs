// Samples CPU and memory of a running Mivuneko for the plan's idle targets (Slice 0, PoC 8).
// Usage: node scripts/bench/idle-probe.mjs [seconds=180] [interval=5]
// macOS: reports the app process only; WebKit content processes run as XPC services and
// cannot be attributed to the app with ps. Windows: includes msedgewebview2 children.
import { execFileSync } from "node:child_process";

const seconds = Number(process.argv[2] ?? 180),
  interval = Number(process.argv[3] ?? 5);
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
function sample() {
  if (process.platform === "win32") {
    const out = execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      "$app = Get-Process mivuneko-desktop -ErrorAction Stop; $ids = @($app.Id) + (Get-CimInstance Win32_Process | Where-Object { $app.Id -contains $_.ParentProcessId -and $_.Name -eq 'msedgewebview2.exe' } | ForEach-Object ProcessId); Get-Process -Id $ids | ForEach-Object { '{0} {1} {2}' -f $_.Id, $_.CPU, $_.WorkingSet64 }",
    ]).toString();
    return out
      .trim()
      .split(/\r?\n/)
      .map((l) => l.split(" ").map(Number))
      .map(([pid, cpuSeconds, bytes]) => ({
        pid,
        cpuSeconds,
        rssMb: bytes / 2 ** 20,
      }));
  }
  const out = execFileSync("ps", ["-axo", "pid=,%cpu=,rss=,comm="]).toString();
  return out
    .split("\n")
    .filter((l) => /mivuneko-desktop$/.test(l.trim()))
    .map((l) => l.trim().split(/\s+/))
    .map(([pid, cpu, rss]) => ({ pid: +pid, cpu: +cpu, rssMb: +rss / 1024 }));
}
const samples = [];
const first = sample();
if (!first.length) throw Error("Mivuneko is not running");
for (let t = 0; t < seconds; t += interval) {
  await sleep(interval);
  samples.push(sample());
}
const total = (s, k) => s.reduce((a, p) => a + (p[k] ?? 0), 0);
const rss = samples.map((s) => total(s, "rssMb"));
let cpu;
if (process.platform === "win32") {
  // CPU seconds delta over wall time, as a percentage of one core.
  cpu =
    ((total(samples.at(-1), "cpuSeconds") - total(first, "cpuSeconds")) /
      seconds) *
    100;
} else cpu = samples.reduce((a, s) => a + total(s, "cpu"), 0) / samples.length;
console.log(
  JSON.stringify({
    platform: process.platform,
    seconds,
    processes: first.length,
    avgCpuPercentOfOneCore: +cpu.toFixed(2),
    rssMbMin: +Math.min(...rss).toFixed(1),
    rssMbMax: +Math.max(...rss).toFixed(1),
  }),
);
