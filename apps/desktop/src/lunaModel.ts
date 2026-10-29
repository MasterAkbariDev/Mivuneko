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
export const illustratedPoses: LunaPose[] = [
  "idle",
  "happy",
  "surprised",
  "angry",
  "sleeping",
  "speaking",
  "thinking",
  "listening",
  "shy",
  "sad",
  "celebrating",
  "dancing",
  "excited",
  "confused",
  "love",
  "joking",
  "teasing",
  "wink",
  "proud",
  "crying",
  "determined",
];
const completePoses = Object.fromEntries(
  illustratedPoses.map((pose, i) => [pose, [0, i % 6, Math.floor(i / 6)]]),
) as Record<LunaPose, [number, number, number]>;
export const characters: Record<
  CharacterId,
  {
    name: string;
    columns?: number;
    rows?: number;
    motionAtlas?: string;
    atlases: readonly string[];
    poses: Record<LunaPose, readonly number[]>;
  }
> = {
  mochi: {
    name: "Mochi",
    atlases: ["/characters/mochi-complete-v3.png"],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/mochi-complete-v3.png",
    poses: completePoses,
  },
  luna: {
    name: "Luna",
    atlases: lunaModel.atlases,
    poses: lunaModel.poses,
    motionAtlas: "/characters/luna-locomotion-v3.png",
  },
  miku: {
    name: "Miku · unofficial fan art",
    atlases: ["/characters/miku-complete-v3.png"],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/miku-complete-v3.png",
    poses: completePoses,
  },
  kitsune: {
    name: "Kiko · fox companion",
    atlases: ["/characters/kitsune-complete-v3.png"],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/kitsune-complete-v3.png",
    poses: completePoses,
  },
  stella: {
    name: "Stella · star companion",
    atlases: ["/characters/stella-complete-v3.png"],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/stella-complete-v3.png",
    poses: completePoses,
  },
  teto: {
    name: "Teto · unofficial fan art",
    atlases: ["/characters/teto-complete-v3.png"],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/teto-complete-v3.png",
    poses: completePoses,
  },
  neru: {
    name: "Neru · unofficial fan art",
    atlases: ["/characters/neru-complete-v3.png"],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/neru-complete-v3.png",
    poses: completePoses,
  },
  snow: {
    name: "Yuki · white hair",
    atlases: ["/characters/snow-complete-v3.png"],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/snow-complete-v3.png",
    poses: completePoses,
  },
  silver: {
    name: "Sora · silver hair",
    atlases: ["/characters/silver-complete-v3.png"],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/silver-complete-v3.png",
    poses: completePoses,
  },
  azure: {
    name: "Aoi · blue eyes",
    atlases: ["/characters/azure-complete-v3.png"],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/azure-complete-v3.png",
    poses: completePoses,
  },
  goth: {
    name: "Raven · gothic",
    atlases: ["/characters/goth-complete-v3.png"],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/goth-complete-v3.png",
    poses: completePoses,
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

  if (mood === "concerned") return "sad";
  if (mood === "error") return "angry";
  return mood;
}
