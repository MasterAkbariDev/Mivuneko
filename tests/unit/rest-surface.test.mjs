import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseRestSurface,
  restPoint,
} from "../../packages/shared-schemas/rest-surface.ts";
const area = { x: 0, y: 0, width: 1920, height: 1040 },
  size = { width: 300, height: 450 },
  position = { x: 400, y: 200 };
const ledge = {
  id: "window:1",
  left: 200,
  right: 1000,
  y: 600,
  kind: "window",
};
test("sitting requires a visible support with room for both head and legs", () => {
  assert.equal(chooseRestSurface([], position, size, area, 280), null);
  assert.equal(
    chooseRestSurface([{ ...ledge, y: 200 }], position, size, area, 280),
    null,
  );
  assert.equal(
    chooseRestSurface([{ ...ledge, y: 1000 }], position, size, area, 280),
    null,
  );
  assert.equal(
    chooseRestSurface([{ ...ledge, right: 210 }], position, size, area, 280),
    null,
  );
  const chosen = chooseRestSurface([ledge], position, size, area, 280);
  assert.equal(chosen.point.y + 280, ledge.y);
  assert.equal(chosen.surface.id, "window:1");
});
test("supported seats follow moving ledges and choose the closest reachable surface", () => {
  const other = {
    ...ledge,
    id: "icon:1",
    left: 1300,
    right: 1350,
    y: 700,
    kind: "icon",
  };
  assert.equal(
    chooseRestSurface([other, ledge], position, size, area, 280).surface.id,
    ledge.id,
  );
  assert.equal(restPoint({ ...ledge, y: 650 }, position, size, 280).y, 370);
  const negative = { x: -1920, y: -100, width: 1920, height: 1080 };
  assert.ok(
    chooseRestSurface(
      [{ ...ledge, left: -1200, right: -500, y: 500 }],
      { x: -900, y: 0 },
      size,
      negative,
      280,
    ),
  );
});

test("taskbar is reserved for lying down, never sitting", () => {
  const surface = {
    id: "taskbar:1",
    kind: "taskbar",
    left: 0,
    right: 1920,
    y: 1040,
  };
  assert.equal(chooseRestSurface([surface], position, size, area, 280), null);
  const lying = chooseRestSurface(
    [surface],
    position,
    size,
    area,
    280,
    { top: 0, bottom: 430 },
    "lie",
  );
  assert.equal(lying.point.y + 430, surface.y);
  assert.equal(
    chooseRestSurface(
      [ledge],
      position,
      size,
      area,
      280,
      { top: 0, bottom: 430 },
      "lie",
    ),
    null,
  );
});
