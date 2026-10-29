export type CharacterFormat = "2d" | "2.5d" | "3d";
export type CharacterVoice =
  | { kind: "none" }
  | { kind: "reference"; asset: string; transcript: string; language?: string }
  | { kind: "prompt"; prompt: string; language?: string };
export interface PackAsset {
  path: string;
  type: "image" | "vrm" | "audio";
  grid?: { columns: number; rows: number };
}
export interface PackFrame {
  asset: string;
  rect?: [number, number, number, number];
  cell?: [number, number];
  anchor: [number, number];
}
export interface PackPose {
  frames: { frame: string; durationMs: number }[];
  loop: boolean;
}
export interface PackLayer {
  id: string;
  frame: string;
  depth: number;
  origin: [number, number];
}
export interface CharacterPack {
  schemaVersion: 1;
  id: string;
  name: string;
  author: string;
  license: string;
  format: CharacterFormat;
  assets: Record<string, PackAsset>;
  frames: Record<string, PackFrame>;
  poses: Record<string, PackPose>;
  fallbackPose: string;
  layers: PackLayer[];
  model?: string;
  voice: CharacterVoice;
  expressions?: Record<string, Record<string, number>>;
}
function fail(message: string): never {
  throw Error(message);
}
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : fail("Expected a JSON object");
const text = (v: unknown, label: string, max = 120) =>
  typeof v === "string" &&
  v.trim() &&
  v.length <= max &&
  !/[\u0000-\u001f]/.test(v)
    ? v.trim()
    : fail(`Invalid ${label}`);
const number = (v: unknown, min: number, max: number, label: string) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
    ? v
    : fail(`Invalid ${label}`);
const pair = (v: unknown, label: string): [number, number] =>
  Array.isArray(v) && v.length === 2
    ? [number(v[0], 0, 1, label), number(v[1], 0, 1, label)]
    : fail(`Invalid ${label}`);
export function packPath(v: unknown) {
  const p = text(v, "asset path", 180);
  if (
    p.startsWith("/") ||
    /[\\:%?#]/.test(p) ||
    p.split("/").some((s) => !s || s === "." || s === "..")
  )
    fail(
      "Asset paths must be relative and cannot traverse folders or use URLs",
    );
  return p.normalize("NFC");
}
const key = (v: string) =>
  /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(v)
    ? v
    : fail("Invalid asset, pose or frame identifier");
export function parseCharacterPack(value: unknown): CharacterPack {
  const p = object(value);
  if (p.schemaVersion !== 1) fail("Unsupported character pack version");
  if (!["2d", "2.5d", "3d"].includes(String(p.format)))
    fail("Unsupported character format");
  const assets: Record<string, PackAsset> = Object.create(null);
  const rawAssets = Object.entries(object(p.assets));
  if (!rawAssets.length || rawAssets.length > 256)
    fail("A pack needs 1-256 assets");
  const paths = new Set<string>();
  for (const [id, value] of rawAssets) {
    key(id);
    const a = object(value),
      path = packPath(a.path);
    if (paths.has(path.toLocaleLowerCase()))
      fail("Asset paths must be unique, including letter case");
    paths.add(path.toLocaleLowerCase());
    if (!["image", "vrm", "audio"].includes(String(a.type)))
      fail("Unsupported asset type");
    const out: PackAsset = { path, type: a.type as PackAsset["type"] };
    if (a.grid) {
      const g = object(a.grid);
      out.grid = {
        columns: number(g.columns, 1, 64, "grid columns"),
        rows: number(g.rows, 1, 64, "grid rows"),
      };
      if (
        !Number.isInteger(out.grid.columns) ||
        !Number.isInteger(out.grid.rows)
      )
        fail("Grid dimensions must be whole numbers");
    }
    assets[id] = out;
  }
  const frames: Record<string, PackFrame> = Object.create(null);
  const rawFrames = Object.entries(object(p.frames ?? {}));
  if (rawFrames.length > 2048) fail("Too many frames");
  for (const [id, value] of rawFrames) {
    key(id);
    const f = object(value),
      asset = text(f.asset, "frame asset");
    if (assets[asset]?.type !== "image")
      fail("Every frame must refer to an image asset");
    const out: PackFrame = {
      asset,
      anchor: f.anchor ? pair(f.anchor, "frame anchor") : [0.5, 1],
    };
    if (f.cell !== undefined) {
      const g = assets[asset].grid;
      if (!g || !Array.isArray(f.cell) || f.cell.length !== 2)
        fail("Cell frames need an atlas grid");
      out.cell = [
        number(f.cell[0], 0, g.columns - 1, "cell column"),
        number(f.cell[1], 0, g.rows - 1, "cell row"),
      ];
      if (out.cell.some((v) => !Number.isInteger(v)))
        fail("Cell indices must be whole numbers");
    }
    if (f.rect !== undefined) {
      if (out.cell || !Array.isArray(f.rect) || f.rect.length !== 4)
        fail("Choose either rect or cell for a frame");
      out.rect = f.rect.map((v, i) =>
        number(v, i < 2 ? 0 : 1, 16384, "frame rectangle"),
      ) as [number, number, number, number];
      if (out.rect.some((v) => !Number.isInteger(v)))
        fail("Pixel rectangles must use whole numbers");
    }
    frames[id] = out;
  }
  const poses: Record<string, PackPose> = Object.create(null);
  const rawPoses = Object.entries(object(p.poses ?? {}));
  if (rawPoses.length > 128) fail("Too many poses");
  for (const [id, value] of rawPoses) {
    key(id);
    const pose = object(value);
    if (
      !Array.isArray(pose.frames) ||
      !pose.frames.length ||
      pose.frames.length > 240
    )
      fail("A pose needs 1-240 frames");
    const sequence = pose.frames.map((value) => {
      const f = object(value),
        frame = text(f.frame, "pose frame");
      if (!frames[frame]) fail("Pose refers to a missing frame");
      return {
        frame,
        durationMs: number(f.durationMs ?? 125, 16, 10000, "frame duration"),
      };
    });
    if (sequence.reduce((n, f) => n + f.durationMs, 0) > 600000)
      fail("Pose duration exceeds ten minutes");
    poses[id] = { frames: sequence, loop: pose.loop === true };
  }
  const fallbackPose =
    typeof p.fallbackPose === "string" ? p.fallbackPose : "idle";
  if (p.format !== "3d" && !poses[fallbackPose])
    fail("Illustrated packs require an idle/fallback pose");
  const layers: PackLayer[] = [];
  if (p.layers !== undefined) {
    if (p.format !== "2.5d" || !Array.isArray(p.layers) || p.layers.length > 16)
      fail("Only 2.5D packs can have up to sixteen layers");
    const ids = new Set<string>();
    for (const value of p.layers) {
      const l = object(value),
        id = key(text(l.id, "layer id"));
      if (ids.has(id)) fail("Layer IDs must be unique");
      ids.add(id);
      const frame = text(l.frame, "layer frame");
      if (!frames[frame]) fail("Layer refers to a missing frame");
      layers.push({
        id,
        frame,
        depth: number(l.depth ?? 0, -1, 1, "layer depth"),
        origin: l.origin ? pair(l.origin, "layer origin") : [0.5, 0.5],
      });
    }
  }
  const model = typeof p.model === "string" ? p.model : undefined;
  if (p.format === "3d" && (!model || assets[model]?.type !== "vrm"))
    fail("3D packs require a VRM model asset");
  let voice: CharacterVoice = { kind: "none" };
  if (p.voice) {
    const v = object(p.voice);
    if (v.kind === "reference") {
      const asset = text(v.asset, "voice reference");
      if (assets[asset]?.type !== "audio")
        fail("Voice reference must refer to an audio asset");
      voice = {
        kind: "reference",
        asset,
        transcript: text(v.transcript, "reference transcript", 2000),
        ...(v.language
          ? { language: text(v.language, "voice language", 16) }
          : {}),
      };
    } else if (v.kind === "prompt") {
      voice = {
        kind: "prompt",
        prompt: text(v.prompt, "voice prompt", 2000),
        ...(v.language
          ? { language: text(v.language, "voice language", 16) }
          : {}),
      };
    } else if (v.kind !== "none") fail("Unknown voice type");
  }
  let expressions: CharacterPack["expressions"];
  if (p.expressions) {
    if (p.format !== "3d") fail("Expression morph maps belong to 3D packs");
    expressions = {};
    for (const [pose, value] of Object.entries(object(p.expressions))) {
      key(pose);
      expressions[pose] = {};
      for (const [name, weight] of Object.entries(object(value)))
        expressions[pose][key(name)] = number(weight, 0, 1, "morph weight");
    }
  }
  return {
    schemaVersion: 1,
    id: key(text(p.id, "pack id", 80)),
    name: text(p.name, "character name", 80),
    author: text(p.author, "author", 160),
    license: text(p.license, "license", 500),
    format: p.format as CharacterFormat,
    assets,
    frames,
    poses,
    fallbackPose,
    layers,
    model,
    voice,
    expressions,
  };
}
