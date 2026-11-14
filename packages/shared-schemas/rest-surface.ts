import {
  PET_EXTRA,
  PET_TOP,
  type Point,
  type Size,
  type Area,
} from "./pet-placement.ts";
export interface RestSurface {
  id: string;
  left: number;
  right: number;
  y: number;
  kind: "window" | "icon";
}
export function restPoint(
  surface: RestSurface,
  position: Point,
  size: Size,
  seatOffset: number,
): Point {
  const center = Math.max(
    surface.left + 8,
    Math.min(surface.right - 8, position.x + size.width / 2),
  );
  return { x: center - size.width / 2, y: surface.y - seatOffset };
}
export function chooseRestSurface(
  surfaces: RestSurface[],
  position: Point,
  size: Size,
  area: Area,
  seatOffset = PET_TOP + (size.height - PET_EXTRA) * 0.62,
) {
  return (
    surfaces
      .filter(
        (s) =>
          s.right - s.left >= 24 &&
          s.y >= area.y + seatOffset + 8 &&
          s.y + size.height - seatOffset <= area.y + area.height - 8,
      )
      .map((surface) => ({
        surface,
        point: restPoint(surface, position, size, seatOffset),
      }))
      .sort(
        (a, b) =>
          Math.hypot(a.point.x - position.x, a.point.y - position.y) -
          Math.hypot(b.point.x - position.x, b.point.y - position.y),
      )[0] ?? null
  );
}
