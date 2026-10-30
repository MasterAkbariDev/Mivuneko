// Summarizes a stream-ab.mjs JSONL file as a Markdown table. Usage: node scripts/bench/stream-ab-summary.mjs <file.jsonl>
import fs from "node:fs";
const rows = fs
  .readFileSync(process.argv[2], "utf8")
  .trim()
  .split("\n")
  .map(JSON.parse);
const q = (a, p) => {
  const s = a.filter((x) => x != null).sort((x, y) => x - y);
  return s.length
    ? Math.round(
        s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))],
      )
    : null;
};
const cells = [...new Set(rows.map((r) => r.cell))];
const fmt = (v) => (v == null ? "—" : String(v));
console.log(
  "| cell | n | err | first byte p50 | first char p50/p90 | first sentence p50/p90 | end p50 | malformed | emotion ok | actions ok (action prompts) | action latency p50 | trailer leak |",
);
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const c of cells) {
  const r = rows.filter((x) => x.cell === c),
    ok = r.filter((x) => !x.error);
  const act = ok.filter((x) => x.kind === "action");
  const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "—");
  console.log(
    `| ${c} | ${r.length} | ${r.length - ok.length} | ${fmt(
      q(
        ok.map((x) => x.t1),
        0.5,
      ),
    )} | ${fmt(
      q(
        ok.map((x) => x.t2),
        0.5,
      ),
    )} / ${fmt(
      q(
        ok.map((x) => x.t2),
        0.9,
      ),
    )} | ${fmt(
      q(
        ok.map((x) => x.t3),
        0.5,
      ),
    )} / ${fmt(
      q(
        ok.map((x) => x.t3),
        0.9,
      ),
    )} | ${fmt(
      q(
        ok.map((x) => x.t5),
        0.5,
      ),
    )} | ${pct(ok.filter((x) => x.malformed).length, ok.length)} | ${pct(ok.filter((x) => x.emotionOk).length, ok.length)} | ${pct(act.filter((x) => x.actionsOk && x.actions?.length).length, act.length)} | ${fmt(
      q(
        act.map((x) => x.actionLatency),
        0.5,
      ),
    )} | ${ok.filter((x) => x.trailerLeak).length} |`,
  );
}
const errs = rows
  .filter((x) => x.error)
  .map((x) => `${x.cell} ${x.status} ${String(x.error).slice(0, 90)}`);
if (errs.length)
  console.log("\nErrors:\n" + [...new Set(errs)].slice(0, 8).join("\n"));
