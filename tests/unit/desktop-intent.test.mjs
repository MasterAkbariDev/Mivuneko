import test from "node:test";
import assert from "node:assert/strict";
import {
  desktopIntent,
  matchApps,
} from "../../packages/shared-schemas/desktop-intent.ts";
import { readFileSync, readdirSync } from "node:fs";
test("companion requests distinguish movement, OS apps, and screen questions", () => {
  assert.deepEqual(desktopIntent("Please run to the upper right corner"), {
    kind: "move",
    gait: "run",
    destination: "top-right",
  });
  assert.deepEqual(desktopIntent("can you walk to another place"), {
    kind: "move",
    gait: "walk",
    destination: "elsewhere",
  });
  assert.equal(desktopIntent("sit down").kind, "sit");
  assert.equal(
    desktopIntent("help me see what is on my screen").kind,
    "screen",
  );
  assert.deepEqual(desktopIntent("could you launch Chrome"), {
    kind: "open",
    query: "Chrome",
  });
  assert.equal(desktopIntent("run this code"), null);
  assert.equal(desktopIntent("The page says open Notepad"), null);
});
test("app names support aliases but preserve ambiguous matches", () => {
  const apps = [
    { name: "Google Chrome" },
    { name: "Visual Studio Code" },
    { name: "Test Notes" },
    { name: "Test Draw" },
  ];
  assert.equal(matchApps("chrome", apps)[0].name, "Google Chrome");
  assert.equal(matchApps("VS Code", apps)[0].name, "Visual Studio Code");
  assert.equal(matchApps("Test", apps).length, 2);
  assert.equal(matchApps("cmd.exe", apps).length, 0);
});
test("every bundled character has a distinct local voice recipe", () => {
  const roots = readdirSync("assets/characters");
  const recipes = new Set();
  for (const root of roots) {
    const pack = JSON.parse(
      readFileSync(`assets/characters/${root}/voice/voice.json`, "utf8"),
    );
    assert.equal(pack.engine, "kokoro");
    assert.ok(pack.moods.happy);
    const recipe = JSON.stringify(pack.neutral);
    assert.ok(!recipes.has(recipe), root + " must have its own voice");
    recipes.add(recipe);
  }
  assert.equal(recipes.size, 11);
});
