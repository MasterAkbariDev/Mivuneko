import test from "node:test";
import assert from "node:assert/strict";
import {
  areaOf,
  contain,
  nearestDisplay,
  displayFor,
  destinationPoint,
  fittedSize,
  petWindowSize,
  reachable,
  routeBetween,
  advance,
} from "../../packages/shared-schemas/pet-placement.ts";
import { desktopIntent } from "../../packages/shared-schemas/desktop-intent.ts";
const display = (x, y, width = 1920, height = 1080, scaleFactor = 1) => ({
  position: { x, y },
  workArea: { position: { x, y }, size: { width, height } },
  scaleFactor,
});
const size = { width: 320, height: 450 };
test("left and right preserve vertical position; repeated requests continue toward the same edge", () => {
  for (const m of [
    display(0, 0),
    display(-1920, -250),
    display(1920, 1080, 2560, 1440, 1.5),
  ]) {
    const a = areaOf(m),
      p = { x: a.x + 600, y: a.y + 300 };
    const right = destinationPoint("right", p, size, m),
      left = destinationPoint("left", p, size, m);
    assert.equal(right.y, p.y);
    assert.equal(left.y, p.y);
    assert.ok(right.x > p.x);
    assert.ok(left.x < p.x);
    assert.ok(destinationPoint("right", right, size, m).x >= right.x);
  }
});
test("all directions and the exact center stay within each display", () => {
  for (const m of [
    display(0, 0),
    display(-2560, 0, 2560, 1440),
    display(0, -1200, 1920, 1200),
  ])
    for (const d of [
      "left",
      "right",
      "up",
      "down",
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
      "center",
      "elsewhere",
    ]) {
      const p = destinationPoint(
        d,
        { x: m.position.x + 500, y: m.position.y + 200 },
        size,
        m,
      );
      assert.deepEqual(p, contain(p, size, areaOf(m)));
      if (d === "center") {
        assert.equal(
          p.x,
          m.position.x + (m.workArea.size.width - size.width) / 2,
        );
        assert.equal(
          p.y,
          m.position.y + (m.workArea.size.height - size.height) / 2,
        );
      }
    }
});
test("off-screen persisted positions recover into a real display", () => {
  const all = [display(-1920, 0), display(0, 0)];
  for (const p of [
    { x: -1e8, y: 1e7 },
    { x: 1e8, y: -1e7 },
  ]) {
    const m = nearestDisplay(p, size, all),
      q = contain(p, size, areaOf(m));
    assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y));
    assert.deepEqual(q, contain(q, size, areaOf(m)));
  }
});
test("other and directional monitor requests select one destination or report an unavailable display", () => {
  const a = display(0, 0),
    b = display(-1920, 0),
    c = display(0, -1080),
    all = [a, b, c];
  assert.equal(displayFor("monitor-other", a, all), c);
  assert.equal(displayFor("monitor-left", a, all), b);
  assert.equal(displayFor("monitor-up", a, all), c);
  assert.equal(displayFor("monitor-3", a, all), c);
  assert.equal(displayFor("monitor-1", a, [a]), a);
  assert.throws(() => displayFor("monitor-other", a, [a]), /only one/);
  assert.throws(() => displayFor("monitor-right", a, all), /no monitor/);
});
test("gaps and diagonal layouts use a visible edge handoff instead of walking into empty desktop", () => {
  const a = display(0, 0),
    b = display(4000, 1500),
    target = destinationPoint("center", { x: 0, y: 0 }, size, b),
    route = routeBetween({ x: 300, y: 250 }, target, size, a, b);
  assert.equal(route[1].transfer, true);
  assert.deepEqual(route[0], contain(route[0], size, areaOf(a)));
  assert.deepEqual(
    { x: route[1].x, y: route[1].y },
    contain(route[1], size, areaOf(b)),
  );
});
test("unlimited requested zoom fits every display without impossible or off-screen surface sizes", () => {
  for (const m of [
    display(0, 0),
    display(0, 0, 1280, 720, 2),
    display(-1920, 0, 1920, 1080, 1.25),
  ])
    for (const requested of [0.25, 1, 4, 100, 1e9]) {
      const f = fittedSize(requested, m);
      assert.ok(
        f.width <= m.workArea.size.width && f.height <= m.workArea.size.height,
      );
      assert.ok(f.scale > 0 && f.scale <= requested);
      if (requested > 100) assert.equal(f.fitted, true);
    }
});
test("movement reaches its target without overshoot or reversing axes", () => {
  let p = { x: 0, y: 200 };
  for (let i = 0; i < 1000; i++) {
    const step = advance(p, { x: 500, y: 200 }, 200, 0.016);
    assert.equal(step.point.y, 200);
    assert.ok(step.point.x >= p.x && step.point.x <= 500);
    p = step.point;
  }
  assert.deepEqual(p, { x: 500, y: 200 });
});
test("natural movement wording selects real movement including another monitor", () => {
  for (const text of [
    "come in the center of the screen",
    "come to the center of my screen",
  ]) {
    assert.equal(desktopIntent(text).destination, "center");
  }
  assert.equal(
    desktopIntent("go to my other monitor").destination,
    "monitor-other",
  );
  assert.equal(
    desktopIntent("walk to the monitor on my left").destination,
    "monitor-left",
  );
  assert.equal(desktopIntent("go to monitor 2").destination, "monitor-2");
  assert.equal(desktopIntent("go right").destination, "right");
  assert.equal(desktopIntent("where are you?").kind, "locate");
});

test("the pet window can exceed a monitor while a usable strip remains reachable", () => {
  const m = display(0, 0, 1920, 1080),
    s = petWindowSize(6, m);
  assert.equal(s.scale, 6);
  assert.ok(s.height > m.workArea.size.height);
  const p = reachable({ x: -1e6, y: -1e6 }, s, areaOf(m));
  assert.ok(p.x + s.width >= 220);
  assert.ok(p.y + s.height >= 160);
});
