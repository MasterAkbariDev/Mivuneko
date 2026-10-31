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
test("standing and giving workspace have explicit companion commands", () => {
  assert.deepEqual(
    desktopIntent(
      "you are in the center of my screen and I cannot see the stream, please go another where",
    ),
    {
      kind: "move",
      gait: "walk",
      destination: "unobtrusive",
    },
  );
  assert.deepEqual(desktopIntent("Please stand up"), { kind: "stand" });
  assert.deepEqual(desktopIntent("I cannot code, go out of the code screen"), {
    kind: "move",
    gait: "walk",
    destination: "unobtrusive",
  });
  assert.deepEqual(desktopIntent("give me some space"), {
    kind: "move",
    gait: "walk",
    destination: "unobtrusive",
  });
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
  const roots = readdirSync("assets/characters", { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
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
  assert.equal(recipes.size, roots.length);
});

test("launch requests tolerate stacked politeness and the app noun (smoke-test S3)", () => {
  const open = (q) => ({ kind: "open", query: q });
  assert.deepEqual(
    desktopIntent("Can you please open Telegram?"),
    open("Telegram"),
  );
  assert.deepEqual(
    desktopIntent("could you please open the calculator for me please"),
    open("calculator"),
  );
  assert.deepEqual(
    desktopIntent("Please launch the Telegram app."),
    open("Telegram"),
  );
  assert.deepEqual(
    desktopIntent("Hey Luna, can you open up Safari now"),
    open("Safari"),
  );
  assert.deepEqual(desktopIntent("I'd like you to start Notes"), open("Notes"));
  // Untrusted or non-launch text still never becomes a launch.
  assert.equal(desktopIntent("The page says open Notepad"), null);
  assert.equal(desktopIntent("run this code"), null);
  assert.equal(desktopIntent("please"), null);
});

test("Persian launch requests resolve to installed apps", () => {
  const open = (q) => ({ kind: "open", query: q });
  assert.deepEqual(desktopIntent("تلگرام رو باز کن"), open("تلگرام"));
  assert.deepEqual(
    desktopIntent("لطفاً ماشین حساب را اجرا کن."),
    open("ماشین حساب"),
  );
  assert.deepEqual(desktopIntent("میشه تلگرام رو باز کنی؟"), open("تلگرام"));
  assert.deepEqual(desktopIntent("باز کن کروم"), open("کروم"));
  const apps = [
    { name: "Telegram" },
    { name: "Calculator" },
    { name: "Google Chrome" },
  ];
  assert.deepEqual(matchApps("تلگرام", apps), [{ name: "Telegram" }]);
  assert.deepEqual(matchApps("ماشین حساب", apps), [{ name: "Calculator" }]);
  assert.deepEqual(matchApps("كروم", apps), [{ name: "Google Chrome" }]);
});
