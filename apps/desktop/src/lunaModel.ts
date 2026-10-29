import { detailedArtwork } from "./highResolutionCharacters.ts";
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
const detailedBase = (alternate = false) => {
  const result: Record<LunaPose, readonly number[]> = { ...completePoses };
  for (const pose of illustratedPoses)
    result[pose] = [1, completePoses[pose][1], completePoses[pose][2]];
  Object.assign(
    result,
    { idle: [0, 0, 0], happy: [0, 1, 0], surprised: [0, 2, 0] },
    alternate
      ? { sad: [0, 0, 1], celebrating: [0, 1, 1], sleeping: [0, 2, 1] }
      : { sleeping: [0, 0, 1], speaking: [0, 1, 1], shy: [0, 2, 1] },
  );
  return result;
};
export const characters: Record<
  CharacterId,
  {
    name: string;
    grids?: readonly (readonly [number, number])[];
    columns?: number;
    rows?: number;
    motionAtlas?: string;
    motionAtlases?: readonly string[];
    sitPose?: readonly number[];
    dragPose?: readonly number[];
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
    sitPose: [3, 2, 1],
  },
  miku: {
    name: "Miku",
    atlases: [
      "/characters/miku-fan-atlas.png",
      "/characters/miku-complete-v3.png",
    ],
    grids: [
      [3, 2],
      [6, 7],
    ],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/miku-complete-v3.png",
    poses: detailedBase(false),
  },
  kitsune: {
    name: "Kiko",
    atlases: [
      "/characters/kitsune-atlas.png",
      "/characters/kitsune-complete-v3.png",
    ],
    grids: [
      [3, 2],
      [6, 7],
    ],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/kitsune-complete-v3.png",
    poses: detailedBase(false),
  },
  stella: {
    name: "Stella",
    atlases: [
      "/characters/stella-atlas.png",
      "/characters/stella-complete-v3.png",
    ],
    grids: [
      [3, 2],
      [6, 7],
    ],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/stella-complete-v3.png",
    poses: detailedBase(false),
  },
  teto: {
    name: "Teto",
    atlases: [
      "/characters/teto-fan-atlas.png",
      "/characters/teto-complete-v3.png",
    ],
    grids: [
      [3, 2],
      [6, 7],
    ],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/teto-complete-v3.png",
    poses: detailedBase(false),
  },
  neru: {
    name: "Neru",
    atlases: [
      "/characters/neru-fan-atlas.png",
      "/characters/neru-complete-v3.png",
    ],
    grids: [
      [3, 2],
      [6, 7],
    ],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/neru-complete-v3.png",
    poses: detailedBase(false),
  },
  snow: {
    name: "Yuki",
    atlases: ["/characters/snow-atlas.png", "/characters/snow-complete-v3.png"],
    grids: [
      [3, 2],
      [6, 7],
    ],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/snow-complete-v3.png",
    poses: detailedBase(false),
  },
  silver: {
    name: "Sora",
    atlases: [
      "/characters/silver-atlas.png",
      "/characters/silver-complete-v3.png",
    ],
    grids: [
      [3, 2],
      [6, 7],
    ],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/silver-complete-v3.png",
    poses: detailedBase(true),
  },
  azure: {
    name: "Aoi",
    atlases: [
      "/characters/azure-atlas.png",
      "/characters/azure-complete-v3.png",
    ],
    grids: [
      [3, 2],
      [6, 7],
    ],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/azure-complete-v3.png",
    poses: detailedBase(true),
  },
  goth: {
    name: "Raven",
    atlases: ["/characters/goth-atlas.png", "/characters/goth-complete-v3.png"],
    grids: [
      [3, 2],
      [6, 7],
    ],
    columns: 6,
    rows: 7,
    motionAtlas: "/characters/goth-complete-v3.png",
    poses: detailedBase(true),
  },
};
for (const [id, detailed] of Object.entries(detailedArtwork)) {
  const model = characters[id as CharacterId];
  if (!model) continue;
  for (const part of detailed.poses) {
    const index = model.atlases.length;
    const grids =
      model.grids ??
      model.atlases.map(() => [model.columns ?? 3, model.rows ?? 2] as const);
    model.atlases = [...model.atlases, part.file];
    model.grids = [...grids, [3, 2]];
    part.names.forEach((pose, i) => {
      const frame = [index, i % 3, Math.floor(i / 3)];
      if (pose in model.poses) model.poses[pose as LunaPose] = frame;
      else if (pose === "sit") model.sitPose = frame;
      else if (pose === "drag") model.dragPose = frame;
    });
  }
  if (
    detailed.motion.length === 3 &&
    detailed.motion.every((file): file is string => typeof file === "string")
  )
    model.motionAtlases = detailed.motion;
}

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
