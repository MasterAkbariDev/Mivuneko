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
  kind: "window" | "icon" | "taskbar";
}
export function restPoint(
  surface: RestSurface,
  position: Point,
  size: Size,
  seatOffset: number,
  feetOffset = size.height - 20,
  posture: "sit" | "lie" = "sit",
): Point {
  const center = Math.max(
    surface.left + 8,
    Math.min(surface.right - 8, position.x + size.width / 2),
  );
  return {
    x: center - size.width / 2,
    y: surface.y - (posture === "lie" ? feetOffset : seatOffset),
  };
}
export function chooseRestSurface(
  surfaces: RestSurface[],
  position: Point,
  size: Size,
  area: Area,
  seatOffset = PET_TOP + (size.height - PET_EXTRA) * 0.62,
  bounds = { top: 0, bottom: size.height },
  posture: "sit" | "lie" = "sit",
) {
  return (
    surfaces
      .filter(
        (s) =>
          s.right - s.left >= 24 &&
          (posture === "lie" ? s.kind === "taskbar" : s.kind !== "taskbar"),
      )
      .map((surface) => ({
        surface,
        point: restPoint(
          surface,
          position,
          size,
          seatOffset,
          bounds.bottom,
          posture,
        ),
      }))
      .filter(
        ({ surface, point }) =>
          surface.kind === "taskbar" ||
          (point.y + bounds.top >= area.y + 6 &&
            point.y + bounds.bottom <= area.y + area.height - 6),
      )
      .sort(
        (a, b) =>
          Math.hypot(a.point.x - position.x, a.point.y - position.y) -
          Math.hypot(b.point.x - position.x, b.point.y - position.y),
      )[0] ?? null
  );
}
