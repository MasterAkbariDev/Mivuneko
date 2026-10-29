import type {
  CharacterId,
  PetMode,
} from "../../../packages/shared-schemas/preferences";
import { characters, type LunaPose } from "./lunaModel.ts";
/** Angle is atan2(dx,dy)/(pi/2), shared with native movement and VRM yaw. */
export function spriteFrame(
  id: CharacterId,
  pose: LunaPose,
  mode: PetMode,
  direction: number,
  tick: number,
  automatic = true,
) {
  const model = characters[id],
    [atlas, column, row] = model.poses[pose];
  const facing =
    Math.abs(direction) >= 1.5
      ? "back"
      : Math.abs(direction) <= 0.5
        ? "front"
        : "side";
  const mirror = facing === "side" && direction < 0;
  let image = model.atlases[atlas],
    columns = model.columns ?? 3,
    rows = model.rows ?? 2,
    c = column,
    r = row;
  if (automatic && model.motionAtlas && (mode === "walk" || mode === "run")) {
    const side = facing === "side" ? 0 : facing === "front" ? 1 : 2;
    const phase = [0, 1, 2, 1][tick % 4];
    let cell: number;
    if (id === "luna") {
      cell = (mode === "run" ? 9 : 0) + side * 3 + phase;
      columns = 6;
      rows = 3;
    } else {
      const pair = (mode === "run" ? 28 : 22) + side * 2,
        passing = (mode === "run" ? 39 : 36) + side;
      cell = phase === 1 ? passing : pair + (phase === 2 ? 1 : 0);
      columns = 6;
      rows = 7;
    }
    image = model.motionAtlas;
    c = cell % 6;
    r = Math.floor(cell / 6);
  } else if (automatic && mode === "sit" && id !== "luna") {
    c = 3;
    r = 3;
  }
  return {
    image,
    column: c,
    row: r,
    columns,
    rows,
    mirror:
      automatic &&
      (mode === "walk" || mode === "run") &&
      (id === "neru" && mode === "walk" && facing === "side"
        ? !mirror
        : mirror),
    facing,
  };
}
