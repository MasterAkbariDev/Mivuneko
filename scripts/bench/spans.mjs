// Summarizes the app's local latency spans (p50/p95 per span and provider/engine).
// Usage: node scripts/bench/spans.mjs [metrics.sqlite]
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";

const id = "dev.mivuneko.companion";
const fallback =
  process.platform === "darwin"
    ? path.join(os.homedir(), "Library/Application Support", id)
    : process.platform === "win32"
      ? path.join(process.env.APPDATA ?? "", id)
      : path.join(os.homedir(), ".local/share", id);
const file = process.argv[2] ?? path.join(fallback, "metrics.sqlite");
const db = new DatabaseSync(file, { readOnly: true });
const rows = db
  .prepare("SELECT name, detail, ms FROM spans ORDER BY name, detail, ms")
  .all();
const groups = new Map();
for (const r of rows) {
  const key = `${r.name}\t${r.detail}`;
  groups.set(key, [...(groups.get(key) ?? []), r.ms]);
}
const pick = (a, p) =>
  Math.round(a[Math.min(a.length - 1, Math.floor(p * a.length))]);
console.log(
  "| span | provider/engine | n | p50 ms | p95 ms |\n|---|---|---|---|---|",
);
for (const [key, ms] of groups) {
  const [name, detail] = key.split("\t");
  console.log(
    `| ${name} | ${detail || "—"} | ${ms.length} | ${pick(ms, 0.5)} | ${pick(ms, 0.95)} |`,
  );
}
