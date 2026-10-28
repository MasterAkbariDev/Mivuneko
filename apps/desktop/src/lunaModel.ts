import type { Mood } from "../../../packages/shared-schemas/index.ts";
import type {
  PetExpression,
  PetMode,
} from "../../../packages/shared-schemas/preferences.ts";
export type LunaPose = Exclude<PetExpression, "auto">;
export const lunaModel = {
  id: "mivuneko.luna.2d",
  version: 1,
  name: "Luna",
  renderer: "sprite-2d",
  cellSize: 512,
  columns: 3,
  rows: 2,
  atlases: ["/characters/luna-atlas.png", "/characters/luna-expressions.png"],
  poses: {
    idle: [0, 0, 0],
    happy: [0, 1, 0],
    surprised: [0, 2, 0],
    angry: [0, 0, 1],
    sleeping: [0, 1, 1],
    speaking: [0, 2, 1],
    thinking: [1, 0, 0],
    listening: [1, 1, 0],
    shy: [1, 2, 0],
    sad: [1, 0, 1],
    celebrating: [1, 1, 1],
    dancing: [1, 2, 1],
  } satisfies Record<LunaPose, number[]>,
} as const;
export function lunaPose(
  mood: Mood,
  mode: PetMode,
  expression: PetExpression,
): LunaPose {
  if (expression !== "auto") return expression;
  if (mode === "sleep") return "sleeping";
  if (mode === "focus") return "thinking";
  if (mode === "dance") return "dancing";
  if (mode === "cozy" && mood === "idle") return "shy";
  if (mode === "playful" && mood === "idle") return "happy";
  if (mood === "curious") return "thinking";
  if (mood === "confused") return "surprised";
  if (mood === "concerned") return "sad";
  if (mood === "error") return "angry";
  return mood;
}
