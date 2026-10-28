import type { Mood } from "../../../packages/shared-schemas/index.ts";
import type {
  CharacterId,
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
  atlases: [
    "/characters/luna-atlas.png",
    "/characters/luna-expressions.png",
    "/characters/luna-emotions-v2.png",
    "/characters/luna-actions-v2.png",
  ],
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
    excited: [2, 0, 0],
    confused: [2, 1, 0],
    love: [2, 2, 0],
    joking: [2, 0, 1],
    teasing: [2, 1, 1],
    wink: [2, 2, 1],
    proud: [3, 0, 0],
    crying: [3, 1, 0],
    determined: [3, 2, 0],
  } satisfies Record<LunaPose, number[]>,
} as const;
const alternatePoses: Record<LunaPose, [number, number, number]> = {
  idle: [0, 0, 0],
  happy: [0, 1, 0],
  surprised: [0, 2, 0],
  angry: [0, 2, 0],
  sleeping: [0, 0, 1],
  speaking: [0, 1, 1],
  thinking: [0, 0, 0],
  listening: [0, 0, 0],
  shy: [0, 2, 1],
  sad: [0, 2, 1],
  celebrating: [0, 1, 0],
  dancing: [0, 1, 0],
  excited: [0, 1, 0],
  confused: [0, 2, 0],
  love: [0, 2, 1],
  joking: [0, 1, 0],
  teasing: [0, 2, 1],
  wink: [0, 2, 1],
  proud: [0, 1, 0],
  crying: [0, 2, 1],
  determined: [0, 0, 0],
};
const newPoses: Record<LunaPose, [number, number, number]> = {
  ...alternatePoses,
  idle: [0, 0, 0],
  happy: [0, 1, 0],
  surprised: [0, 2, 0],
  angry: [0, 0, 1],
  sleeping: [0, 2, 1],
  speaking: [0, 1, 0],
  thinking: [0, 2, 0],
  listening: [0, 2, 0],
  shy: [0, 2, 0],
  sad: [0, 0, 1],
  celebrating: [0, 1, 1],
  dancing: [0, 1, 1],
  excited: [0, 1, 1],
  confused: [0, 2, 0],
  love: [0, 2, 0],
  joking: [0, 1, 1],
  teasing: [0, 2, 0],
  wink: [0, 1, 1],
  proud: [0, 1, 1],
  crying: [0, 0, 1],
  determined: [0, 0, 0],
};
export const characters: Record<
  CharacterId,
  {
    name: string;
    atlases: readonly string[];
    poses: Record<LunaPose, readonly number[]>;
  }
> = {
  luna: { name: "Luna", atlases: lunaModel.atlases, poses: lunaModel.poses },
  miku: {
    name: "Miku · unofficial fan art",
    atlases: ["/characters/miku-fan-atlas.png"],
    poses: alternatePoses,
  },
  kitsune: {
    name: "Kiko · fox companion",
    atlases: ["/characters/kitsune-atlas.png"],
    poses: alternatePoses,
  },
  stella: {
    name: "Stella · star companion",
    atlases: ["/characters/stella-atlas.png"],
    poses: alternatePoses,
  },
  teto: {
    name: "Teto · unofficial fan art",
    atlases: ["/characters/teto-fan-atlas.png"],
    poses: newPoses,
  },
  neru: {
    name: "Neru · unofficial fan art",
    atlases: ["/characters/neru-fan-atlas.png"],
    poses: newPoses,
  },
  snow: {
    name: "Yuki · white hair",
    atlases: ["/characters/snow-atlas.png"],
    poses: newPoses,
  },
  silver: {
    name: "Sora · silver hair",
    atlases: ["/characters/silver-atlas.png"],
    poses: newPoses,
  },
  azure: {
    name: "Aoi · blue eyes",
    atlases: ["/characters/azure-atlas.png"],
    poses: newPoses,
  },
  goth: {
    name: "Raven · gothic",
    atlases: ["/characters/goth-atlas.png"],
    poses: newPoses,
  },
};
export function lunaPose(
  mood: Mood,
  mode: PetMode,
  expression: PetExpression,
): LunaPose {
  if (expression !== "auto") return expression;
  if (mode === "sleep") return "sleeping";
  if (mode === "focus") return "thinking";
  if (mode === "dance") return "dancing";
  if (mode === "sit") return "shy";
  if (mode === "cozy" && mood === "idle") return "shy";
  if (mode === "playful" && mood === "idle") return "happy";
  if (mood === "curious") return "thinking";
  if (mood === "confused") return "surprised";
  if (mood === "concerned") return "sad";
  if (mood === "error") return "angry";
  return mood;
}
