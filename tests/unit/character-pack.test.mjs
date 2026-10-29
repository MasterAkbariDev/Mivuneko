import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseCharacterPack,
  packPath,
} from "../../packages/shared-schemas/character-pack.ts";
const sample = () =>
  JSON.parse(
    readFileSync("docs/character-packs/examples/2d/character.json", "utf8"),
  );
test("all format and voice templates satisfy the character pack contract", () => {
  for (const id of ["2d", "depth", "vrm"]) {
    const p = parseCharacterPack(
      JSON.parse(
        readFileSync(
          `docs/character-packs/examples/${id}/character.json`,
          "utf8",
        ),
      ),
    );
    assert.equal(p.schemaVersion, 1);
    assert.ok(p.name);
  }
});
test("absent voice remains silent; frame lists and atlas mappings preserve explicit identities", () => {
  const a = sample();
  delete a.voice;
  const p = parseCharacterPack(a);
  assert.equal(p.voice.kind, "none");
  assert.equal(
    new Set(Object.values(p.frames).map((f) => f.cell.join(":"))).size,
    6,
  );
  a.poses.idle.frames = [
    { frame: "idle", durationMs: 2000 },
    { frame: "happy", durationMs: 120 },
    { frame: "idle", durationMs: 200 },
  ];
  assert.equal(parseCharacterPack(a).poses.idle.frames.length, 3);
});
test("malformed or excessive character packs fail before import", () => {
  for (const mutate of [
    (p) => (p.schemaVersion = 2),
    (p) => (p.format = "live2d"),
    (p) => (p.assets.expressions.path = "../outside.png"),
    (p) => (p.frames.idle.cell = [4, 1]),
    (p) => (p.frames.idle.rect = [0, 0, 512, 512]),
    (p) => (p.poses.idle.frames = [{ frame: "missing", durationMs: 100 }]),
    (p) => (p.poses.idle.frames = [{ frame: "constructor", durationMs: 100 }]),
    (p) => (p.poses.idle.frames = [{ frame: "idle", durationMs: 0 }]),
    (p) =>
      (p.voice = { kind: "reference", asset: "missing", transcript: "hello" }),
    (p) => (p.voice = { kind: "prompt", prompt: "" }),
    (p) => (p.layers = [{ id: "hair", frame: "idle", depth: 2 }]),
  ]) {
    const p = sample();
    mutate(p);
    assert.throws(() => parseCharacterPack(p));
  }
});
test("character asset paths cannot escape the selected folder or fetch remote content", () => {
  for (const p of [
    "https://host/a.png",
    "C:/a.png",
    "/a.png",
    "../a.png",
    "art/../a.png",
    "art\\a.png",
    "art/%2e%2e/a.png",
    "art/a.png?x=1",
    "a//b.png",
  ])
    assert.throws(() => packPath(p), p);
  assert.equal(packPath("art/pose-01.png"), "art/pose-01.png");
});
