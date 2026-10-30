import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const tauri = "apps/desktop/src-tauri";
const read = (p) => fs.readFileSync(p, "utf8");
const handlers = [
  ...read(`${tauri}/src/main.rs`)
    .split("generate_handler![")[1]
    .split("]")[0]
    .matchAll(/(?:\w+::)?(\w+)/g),
].map((m) => m[1]);
const manifest = [
  ...read(`${tauri}/build.rs`)
    .split("COMMANDS: &[&str] = &[")[1]
    .split("];")[0]
    .matchAll(/"(\w+)"/g),
].map((m) => m[1]);
const allowed = (file) =>
  JSON.parse(read(`${tauri}/capabilities/${file}`))
    .permissions.filter((p) => p.startsWith("allow-"))
    .map((p) => p.slice(6).replace(/-/g, "_"));

// Commands the pet window must never reach: launching, approvals, permissions,
// history, credentials, installs, screen capture and model chat.
const sensitive = [
  "list_apps",
  "request_launch",
  "resolve_launch",
  "revoke",
  "get_launch_policy",
  "set_launch_policy",
  "save_history",
  "load_history",
  "clear_history",
  "configure_gemini",
  "clear_gemini",
  "install_voice_engine",
  "capture_screen",
  "analyze_screen",
  "hermes_chat",
  "gemini_chat",
  "gemini_chat_stream",
  "groq_chat",
  "configure_global_shortcuts",
];

function reachable(entry) {
  const seen = new Set();
  const stack = [path.resolve(entry)];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = read(file);
    for (const m of src.matchAll(
      /(?:import|export)[^'"]*?from\s*["'](\.[^"']+)["']|import\(\s*["'](\.[^"']+)["']\s*\)/g,
    )) {
      const base = path.resolve(path.dirname(file), m[1] ?? m[2]);
      const hit = [base, `${base}.ts`, `${base}.tsx`].find(
        (c) => fs.existsSync(c) && fs.statSync(c).isFile(),
      );
      if (hit) stack.push(hit);
    }
  }
  return [...seen];
}

test("every command is declared once in the app manifest", () => {
  assert.deepEqual([...manifest].sort(), [...handlers].sort());
  assert.equal(new Set(manifest).size, manifest.length);
});

test("the main window may call every command", () => {
  assert.deepEqual(allowed("main.json").sort(), [...handlers].sort());
});

test("the pet window never reaches sensitive commands", () => {
  const pet = allowed("pet.json");
  for (const c of pet) assert.ok(handlers.includes(c), `unknown command ${c}`);
  for (const c of sensitive)
    assert.ok(!pet.includes(c), `pet must not be allowed ${c}`);
});

test("every command the pet's code can call is allowed for the pet", () => {
  const pet = new Set(allowed("pet.json"));
  // The pet imports broker.ts only for isNative; launching lives in the main window.
  const files = reachable("apps/desktop/src/Pet.tsx").filter(
    (f) => !f.endsWith(`${path.sep}broker.ts`),
  );
  for (const file of files) {
    const src = read(file);
    assert.ok(
      !/\bbroker\.\w+\(/.test(src),
      `${file} calls the broker from the pet`,
    );
    for (const c of handlers)
      if (new RegExp(`["'\`]${c}["'\`]`).test(src))
        assert.ok(pet.has(c), `${path.basename(file)} uses ${c}`);
  }
});
