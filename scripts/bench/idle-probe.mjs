// Samples CPU and memory of a running Mivuneko for the plan's idle targets (Slice 0, PoC 8).
// Usage: node scripts/bench/idle-probe.mjs [seconds=180] [interval=5]
// The resident Kokoro worker (the app re-run as --luna-tts) is reported separately.
// macOS: WebKit content processes run as XPC services and can't be attributed with ps, so
// only the app process is counted. Windows: includes the whole WebView2 process tree.
import { execFileSync } from "node:child_process";

const seconds = Number(process.argv[2] ?? 180),
  interval = Number(process.argv[3] ?? 5);
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
function sample() {
  if (process.platform === "win32") {
    const out = execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      "$all = Get-CimInstance Win32_Process; $app = $all | Where-Object { $_.Name -eq 'mivuneko-desktop.exe' -and $_.CommandLine -notmatch '--luna-tts' }; if (-not $app) { throw 'not running' }; $ids = @($app.ProcessId); do { $more = $all | Where-Object { $ids -contains $_.ParentProcessId -and $ids -notcontains $_.ProcessId -and $_.CommandLine -notmatch '--luna-tts' } | ForEach-Object ProcessId; $ids += $more } while ($more); Get-Process -Id $ids | ForEach-Object { '{0} {1} {2}' -f $_.Id, $_.CPU, $_.WorkingSet64 }",
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
  const out = execFileSync("ps", ["-axo", "pid=,%cpu=,rss=,args="]).toString();
  return out
    .split("\n")
    .filter(
      (l) => /mivuneko-desktop(\s|$)/.test(l) && !l.includes("--luna-tts"),
    )
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
