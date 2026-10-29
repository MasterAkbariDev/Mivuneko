import test from "node:test";
import assert from "node:assert/strict";
import {
  companionSequence,
  runCompanionSequence,
} from "../../packages/shared-schemas/companion-actions.ts";
test("monitor, direction and sitting commands compile into an ordered plan", () => {
  const p = companionSequence(
    "go to the first monitor then go up and sit down",
  );
  assert.deepEqual(p.actions, [
    { kind: "move", gait: "walk", destination: "monitor-1" },
    { kind: "move", gait: "walk", destination: "up" },
    { kind: "sit" },
  ]);
});
test("action chains wait for each actual completion before starting the next", async () => {
  const p = companionSequence("go left then go right and sit down"),
    seen = [];
  let release;
  const gate = new Promise((r) => (release = r));
  const run = runCompanionSequence(
    p.actions,
    async (a, i) => {
      seen.push(a.kind === "move" ? a.destination : a.kind);
      if (i === 0) await gate;
    },
    new AbortController().signal,
  );
  assert.deepEqual(seen, ["left"]);
  release();
  await run;
  assert.deepEqual(seen, ["left", "right", "sit"]);
});
test("failure and Stop do not run remaining actions", async () => {
  const p = companionSequence("go left then sit down"),
    seen = [];
  await assert.rejects(
    runCompanionSequence(
      p.actions,
      async (a) => {
        seen.push(a.kind);
        throw Error("Monitor disconnected");
      },
      new AbortController().signal,
    ),
    /disconnected/,
  );
  assert.deepEqual(seen, ["move"]);
  const c = new AbortController();
  seen.length = 0;
  await assert.rejects(
    runCompanionSequence(
      p.actions,
      async (a) => {
        seen.push(a.kind);
        c.abort();
      },
      c.signal,
    ),
  );
  assert.deepEqual(seen, ["move"]);
});
test("unsupported later steps cannot cause a partial action chain", () => {
  const p = companionSequence("go left then delete that folder");
  assert.deepEqual(p.actions, []);
  assert.ok(p.error);
  assert.equal(
    companionSequence("explain closures then give an example"),
    null,
  );
});
