import test from "node:test";
import assert from "node:assert/strict";
import { spriteFrame } from "../../apps/desktop/src/spriteFrames.ts";
import { characters } from "../../apps/desktop/src/lunaModel.ts";
test("every illustrated model has distinct emotions and real directional walk/run cycles", () => {
  for (const id of Object.keys(characters)) {
    const emotions = Object.keys(characters[id].poses).map((p) =>
      spriteFrame(id, p, "stand", 0, 0),
    );
    assert.equal(
      new Set(emotions.map((f) => `${f.image}:${f.column}:${f.row}`)).size,
      21,
      id,
    );
    const gaits = [];
    for (const mode of ["walk", "run"]) {
      for (const direction of [0, 1, 2, -1]) {
        const frames = [0, 1, 2].map((t) =>
          spriteFrame(id, "idle", mode, direction, t),
        );
        assert.equal(
          new Set(frames.map((f) => `${f.image}:${f.column}:${f.row}`)).size,
          3,
          `${id} ${mode} ${direction}`,
        );
        assert.ok(
          frames.every(
            (f) =>
              f.column >= 0 &&
              f.column < f.columns &&
              f.row >= 0 &&
              f.row < f.rows,
          ),
        );
        assert.equal(
          frames[0].mirror,
          id === "neru" &&
            !characters[id].motionAtlases &&
            mode === "walk" &&
            Math.abs(direction) === 1
            ? direction === 1
            : direction === -1,
        );
        gaits.push(
          frames
            .map((f) => `${f.image}:${f.column}:${f.row}:${f.mirror}`)
            .join("|"),
        );
      }
    }
    assert.equal(new Set(gaits).size, 8, id);
  }
});
