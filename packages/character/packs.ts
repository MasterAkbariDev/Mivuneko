export interface CharacterPack {
  id: string;
  name: string;
  format: "procedural" | "vrm";
  capabilities: { walk: boolean; sit: boolean; lipSync: boolean };
  license: string;
}
export const builtInPacks: CharacterPack[] = [
  {
    id: "chibi",
    name: "Luna · 3D prototype",
    format: "procedural",
    capabilities: { walk: true, sit: true, lipSync: false },
    license: "Original project placeholder",
  },
  {
    id: "mock-cat",
    name: "Mooncat · 2D prototype",
    format: "procedural",
    capabilities: { walk: true, sit: true, lipSync: false },
    license: "Original project placeholder",
  },
  {
    id: "local-vrm",
    name: "Your VRM character",
    format: "vrm",
    capabilities: { walk: false, sit: false, lipSync: true },
    license: "User must supply a model with suitable usage rights",
  },
];
export function validateVrmFile(name: string, size: number) {
  if (!name.toLowerCase().endsWith(".vrm"))
    throw Error("Choose a .vrm character file");
  if (size > 50 * 1024 * 1024)
    throw Error("Character exceeds the 50 MB preview limit");
  if (size === 0) throw Error("Character file is empty");
}

export function validateVrmBytes(bytes: ArrayBuffer) {
  if (bytes.byteLength < 20) throw Error("Invalid VRM/GLB container");
  const view = new DataView(bytes);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.byteLength
  )
    throw Error("Expected a binary glTF 2 VRM file");
  const size = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || size > bytes.byteLength - 20)
    throw Error("Missing VRM JSON chunk");
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(bytes, 20, size)),
  );
  if (!json.extensions?.VRMC_vrm && !json.extensions?.VRM)
    throw Error("Missing VRM extension");
  for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (resource.uri && !String(resource.uri).startsWith("data:"))
      throw Error(
        "External model resources are not allowed; use an embedded VRM",
      );
  }
}

export interface VrmInfo {
  name: string;
  authors: string;
  license: string;
  expressions: string[];
}
export function inspectVrm(bytes: ArrayBuffer): VrmInfo {
  validateVrmBytes(bytes);
  const view = new DataView(bytes);
  const json = JSON.parse(
    new TextDecoder().decode(
      new Uint8Array(bytes, 20, view.getUint32(12, true)),
    ),
  );
  const v1 = json.extensions?.VRMC_vrm;
  const v0 = json.extensions?.VRM;
  const meta = v1?.meta ?? v0?.meta ?? {};
  const clean = (value: unknown, fallback: string) =>
    typeof value === "string" ? value.slice(0, 300) : fallback;
  return {
    name: clean(meta.name ?? meta.title, "Imported character"),
    authors: clean(
      Array.isArray(meta.authors) ? meta.authors.join(", ") : meta.author,
      "Unknown author",
    ),
    license: clean(
      meta.licenseUrl ?? meta.licenseName,
      "Review the creator’s terms before use",
    ),
    expressions: v1
      ? Object.keys(v1.expressions?.preset ?? {})
      : (v0?.blendShapeMaster?.blendShapeGroups ?? [])
          .map(
            (g: { presetName?: string; name?: string }) =>
              g.presetName ?? g.name,
          )
          .filter(
            (value: unknown): value is string => typeof value === "string",
          )
          .slice(0, 64),
  };
}
