// Live check that Gemini and Groq follow the shipped tagged-format prompts (Slice 1).
// Usage: node scripts/bench/tagged-live.mjs [runs=2]
// Uses the exact system prompts from crates/gemini-client/golden/*-tagged.json (Assist mode,
// installed catalog ["Calculator"]) and the project .env keys (uses quota; never prints keys).
import fs from "node:fs";
import { taggedProgress } from "../../packages/shared-schemas/tagged.ts";

const runs = Number(process.argv[2] ?? 2);
function readEnv() {
  const env = {};
  const lines = fs.readFileSync(".env", "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(?:export\s+)?([A-Z_]+)\s*=(.*)$/.exec(lines[i]);
    if (!m) continue;
    let value = m[2].trim();
    const q = value[0];
    if (q === '"' || q === "'") {
      value = value.slice(1);
      while (!value.includes(q) && i + 1 < lines.length)
        value += "\n" + lines[++i];
      value = value.slice(0, value.indexOf(q));
    }
    env[m[1]] = value.trim();
  }
  return env;
}
const env = { ...readEnv(), ...process.env };
const geminiKeys = (env.GEMINI_API_KEYS ?? env.GEMINI_API_KEY ?? "")
  .split(/[\s,]+/)
  .filter((k) => k.length > 20);
let turn = 0;
const gemini = JSON.parse(
  fs.readFileSync(
    "crates/gemini-client/golden/gemini-chat-tagged.json",
    "utf8",
  ),
).Assist;
const groqPrompt = JSON.parse(
  fs.readFileSync(
    "crates/gemini-client/golden/groq-prompts-tagged.json",
    "utf8",
  ),
).Assist;
const EMOTIONS =
  "idle happy curious confused concerned celebrating angry sad surprised crying shy love excited teasing joking wink proud determined sleeping".split(
    " ",
  );
const prompts = [
  ["chat", "Hi! How are you today?"],
  ["chat", "I'm feeling a bit down."],
  ["code", "Show me a tiny Python function that adds two numbers."],
  ["fa", "سلام! حالت چطوره؟"],
  ["action", "Please walk to the left side of the screen."],
  ["action", "Sit down and look happy."],
  ["launch", "Can you please open the calculator for me?"],
  ["launch", "Open Calculator"],
];
async function call(provider, prompt) {
  const res =
    provider === "gemini"
      ? await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-goog-api-key": geminiKeys[turn++ % geminiKeys.length],
            },
            body: JSON.stringify({
              ...gemini,
              contents: [{ role: "user", parts: [{ text: prompt }] }],
            }),
          },
        )
      : await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${env.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-120b",
            reasoning_effort: "low",
            max_completion_tokens: 1024,
            messages: [
              { role: "system", content: groqPrompt },
              { role: "user", content: prompt },
            ],
          }),
        });
  const v = await res.json();
  if (!res.ok) throw Error(JSON.stringify(v).slice(0, 200));
  return provider === "gemini"
    ? (v.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("")
    : (v.choices?.[0]?.message?.content ?? "");
}
const stats = {};
for (let r = 0; r < runs; r++)
  for (const provider of ["gemini", "groq"])
    for (const [kind, prompt] of prompts) {
      const s = (stats[provider] ??= {
        n: 0,
        header: 0,
        emotion: 0,
        leak: 0,
        actions: 0,
        actionPrompts: 0,
        launch: 0,
        launchPrompts: 0,
        errors: 0,
      });
      try {
        const raw = await call(provider, prompt);
        s.n++;
        const p = taggedProgress(raw + "\n");
        if (/^\s*@meta/.test(raw)) s.header++;
        if (p.emotion && EMOTIONS.includes(p.emotion)) s.emotion++;
        if (/@meta|@actions|companionActions/.test(p.visible)) s.leak++;
        const last = raw.trimEnd().split("\n").at(-1) ?? "";
        let trailer = null;
        try {
          trailer = last.startsWith("@actions")
            ? JSON.parse(last.slice(8))
            : null;
        } catch {}
        if (kind === "action") {
          s.actionPrompts++;
          if (trailer?.companionActions?.length) s.actions++;
        }
        if (kind === "launch") {
          s.launchPrompts++;
          if (trailer?.appQuery === "Calculator") s.launch++;
        }
      } catch (e) {
        s.errors++;
        console.error(provider, kind, String(e).slice(0, 160));
      }
      await new Promise((r) =>
        setTimeout(r, provider === "gemini" ? 1200 : 600),
      );
    }
console.log(JSON.stringify(stats, null, 1));
