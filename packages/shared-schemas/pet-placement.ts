export const PET_TOP = 128,
  PET_BOTTOM = 88,
  PET_EXTRA = PET_TOP + PET_BOTTOM;
import type { Destination } from "./desktop-intent.ts";
export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Area extends Point, Size {}
export interface Display {
  name?: string | null;
  position: Point;
  workArea: { position: Point; size: Size };
  scaleFactor: number;
}
export function areaOf(m: Display): Area {
  return { ...m.workArea.position, ...m.workArea.size };
}
export function contain(p: Point, s: Size, a: Area): Point {
  return {
    x: Math.max(a.x, Math.min(a.x + Math.max(0, a.width - s.width), p.x)),
    y: Math.max(a.y, Math.min(a.y + Math.max(0, a.height - s.height), p.y)),
  };
}
export function nearestDisplay(p: Point, s: Size, all: Display[]): Display {
  if (!all.length) throw Error("No display is connected.");
  const largestHeight = Math.max(...all.map((m) => m.workArea.size.height));
  const center = {
    x: p.x + s.width / 2,
    y:
      s.height > largestHeight
        ? p.y + PET_TOP + Math.max(0, s.height - PET_EXTRA) * 0.08
        : p.y + s.height / 2,
  };
  return all.reduce((best, m) => {
    const score = (m: Display) => {
      const a = areaOf(m),
        q = contain(center, { width: 0, height: 0 }, a);
      return (q.x - center.x) ** 2 + (q.y - center.y) ** 2;
    };
    return score(m) < score(best) ? m : best;
  });
}
export function displayFor(
  destination: Destination,
  current: Display,
  all: Display[],
): Display {
  if (!destination.startsWith("monitor-")) return current;
  const index = Number(destination.slice(8));
  if (Number.isInteger(index) && index > 0) {
    if (!all[index - 1]) throw Error(`Monitor ${index} is not connected.`);
    return all[index - 1];
  }
  const other = all.filter((m) => m !== current);
  if (!other.length) throw Error("There is only one connected monitor.");
  if (destination === "monitor-other")
    return other.sort(
      (a, b) =>
        Math.hypot(
          a.position.x - current.position.x,
          a.position.y - current.position.y,
        ) -
        Math.hypot(
          b.position.x - current.position.x,
          b.position.y - current.position.y,
        ),
    )[0];
  const dir = destination.slice(8),
    c = areaOf(current);
  const candidates = other.filter((m) => {
    const a = areaOf(m);
    return dir === "left"
      ? a.x + a.width / 2 < c.x + c.width / 2
      : dir === "right"
        ? a.x + a.width / 2 > c.x + c.width / 2
        : dir === "up"
          ? a.y + a.height / 2 < c.y + c.height / 2
          : a.y + a.height / 2 > c.y + c.height / 2;
  });
  if (!candidates.length) throw Error(`There is no monitor to the ${dir}.`);
  return candidates.sort(
    (a, b) =>
      Math.hypot(
        a.position.x - current.position.x,
        a.position.y - current.position.y,
      ) -
      Math.hypot(
        b.position.x - current.position.x,
        b.position.y - current.position.y,
      ),
  )[0];
}
export function destinationPoint(
  destination: Destination,
  p: Point,
  s: Size,
  m: Display,
): Point {
  const a = areaOf(m),
    minX = s.width <= a.width ? a.x : a.x + Math.min(220, a.width) - s.width,
    minY =
      s.height <= a.height ? a.y : a.y + Math.min(160, a.height) - s.height;
  const maxX =
      s.width <= a.width
        ? a.x + a.width - s.width
        : a.x + a.width - Math.min(220, a.width),
    maxY =
      s.height <= a.height
        ? a.y + a.height - s.height
        : a.y + a.height - Math.min(160, a.height),
    step = Math.max(120, a.width * 0.28),
    q = reachable(p, s, a);
  if (destination === "left") return { ...q, x: Math.max(minX, q.x - step) };
  if (destination === "right") return { ...q, x: Math.min(maxX, q.x + step) };
  if (destination === "up")
    return { ...q, y: Math.max(minY, q.y - Math.max(120, a.height * 0.28)) };
  if (destination === "down")
    return { ...q, y: Math.min(maxY, q.y + Math.max(120, a.height * 0.28)) };
  if (destination === "elsewhere")
    return { ...q, x: q.x < a.x + a.width / 2 ? maxX : a.x };
  return {
    x: destination.includes("left")
      ? a.x
      : destination.includes("right")
        ? maxX
        : (minX + maxX) / 2,
    y: destination.startsWith("top")
      ? a.y
      : destination.startsWith("bottom")
        ? maxY
        : (minY + maxY) / 2,
  };
}
export function fittedSize(
  requested: number,
  m: Display,
  illustration = false,
) {
  const a = areaOf(m),
    factor = m.scaleFactor || 1,
    bw = illustration ? 280 : 180,
    bh = illustration ? 280 : 320;
  const scale = Math.max(
    0.1,
    Math.min(
      requested,
      (a.width / factor - 24) / bw,
      (a.height / factor - 136) / bh,
    ),
  );
  return {
    scale,
    width: Math.min(
      a.width,
      Math.ceil(Math.max(300, bw * scale + 24) * factor),
    ),
    height: Math.min(a.height, Math.ceil((bh * scale + 136) * factor)),
    fitted: scale + 0.01 < requested,
  };
}
export interface Waypoint extends Point {
  transfer?: boolean;
}
export function routeBetween(
  p: Point,
  target: Point,
  s: Size,
  from: Display,
  to: Display,
): Waypoint[] {
  if (from === to) return [target];
  const a = areaOf(from),
    b = areaOf(to),
    dx = b.x + b.width / 2 - a.x - a.width / 2,
    dy = b.y + b.height / 2 - a.y - a.height / 2;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const exit = contain(
    horizontal
      ? { x: dx > 0 ? a.x + a.width - s.width : a.x, y: p.y }
      : { x: p.x, y: dy > 0 ? a.y + a.height - s.height : a.y },
    s,
    a,
  );
  const entry = contain(
    horizontal
      ? { x: dx > 0 ? b.x : b.x + b.width - s.width, y: exit.y }
      : { x: exit.x, y: dy > 0 ? b.y : b.y + b.height - s.height },
    s,
    b,
  );
  const gap = horizontal
    ? Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width))
    : Math.max(
        0,
        Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height),
      );
  const gapOther = horizontal
    ? Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height))
    : Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
  return Math.max(gap, gapOther) > 1
    ? [exit, { ...entry, transfer: true }, target]
    : [exit, entry, target];
}
export function advance(p: Point, target: Point, speed: number, dt: number) {
  const dx = target.x - p.x,
    dy = target.y - p.y,
    d = Math.hypot(dx, dy),
    step = Math.max(0, speed * dt);
  return {
    point:
      d <= step
        ? { x: target.x, y: target.y }
        : { x: p.x + (dx / d) * step, y: p.y + (dy / d) * step },
    done: d <= step || d < 1,
    direction: d < 1 ? 0 : Math.atan2(dx, dy) / (Math.PI / 2),
  };
}

// A window may extend beyond the display; keep a usable portion reachable.
export function reachable(p: Point, s: Size, a: Area): Point {
  const mw = Math.min(220, a.width),
    mh = Math.min(160, a.height);
  return {
    x:
      s.width <= a.width
        ? contain(p, s, a).x
        : Math.max(a.x + mw - s.width, Math.min(a.x + a.width - mw, p.x)),
    y:
      s.height <= a.height
        ? contain(p, s, a).y
        : Math.max(a.y + mh - s.height, Math.min(a.y + a.height - mh, p.y)),
  };
}
export function petWindowSize(
  requested: number,
  m: Display,
  illustration = false,
) {
  const factor = m.scaleFactor || 1,
    bw = illustration ? 280 : 180,
    bh = illustration ? 280 : 320;
  // The native platform coordinate/surface limit is independent of monitor size.
  const scale = Math.max(
    0.25,
    Math.min(
      requested,
      (32760 / factor - PET_EXTRA) / bh,
      (32760 / factor - 24) / bw,
    ),
  );
  const width = Math.ceil(Math.max(220, bw * scale + 24) * factor),
    height = Math.ceil((bh * scale + PET_EXTRA) * factor),
    a = areaOf(m);
  return { scale, width, height, fitted: width > a.width || height > a.height };
}
