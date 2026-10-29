import {
  parseCharacterPack,
  packPath,
  type CharacterPack,
} from "../../../packages/shared-schemas/character-pack.ts";
import { inspectVrm } from "../../../packages/character/packs.ts";
export interface SavedPack {
  id: string;
  manifest: CharacterPack;
  assets: Record<string, Blob>;
  importedAt: number;
}
export type PackSummary = Pick<SavedPack, "id" | "manifest" | "importedAt">;
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("mivuneko.assets", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("characters");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(Error("Character library is unavailable"));
  });
}
function changed() {
  const c = new BroadcastChannel("mivuneko.assets");
  c.postMessage("library-changed");
  c.close();
}
export async function savedPack(id: string): Promise<SavedPack | null> {
  const d = await db();
  try {
    return await new Promise((resolve, reject) => {
      const r = d
        .transaction("characters")
        .objectStore("characters")
        .get("pack:" + id);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(Error("Cannot load character pack"));
    });
  } finally {
    d.close();
  }
}
export async function listPacks(): Promise<PackSummary[]> {
  const d = await db();
  try {
    return await new Promise((resolve, reject) => {
      const out: PackSummary[] = [],
        r = d
          .transaction("characters")
          .objectStore("characters")
          .openCursor(IDBKeyRange.bound("packmeta:", "packmeta:\uffff"));
      r.onsuccess = () => {
        const c = r.result;
        if (!c) return resolve(out.sort((a, b) => a.importedAt - b.importedAt));
        out.push(c.value);
        c.continue();
      };
      r.onerror = () => reject(Error("Cannot read character library"));
    });
  } finally {
    d.close();
  }
}
export async function removePack(id: string) {
  const d = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = d.transaction("characters", "readwrite"),
        s = t.objectStore("characters");
      s.delete("pack:" + id);
      s.delete("packmeta:" + id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(Error("Cannot remove character pack"));
    });
    changed();
  } finally {
    d.close();
  }
}
export async function importPack(
  files: File[],
  progress: (value: number) => void = () => {},
): Promise<SavedPack> {
  if (files.length > 512)
    throw Error("Choose a character folder with no more than 512 files.");
  const candidates = files.filter((f) => f.name === "character.json");
  if (candidates.length !== 1)
    throw Error(
      "Choose one character folder containing exactly one character.json.",
    );
  const manifestFile = candidates[0];
  if (manifestFile.size > 256 * 1024)
    throw Error("Character manifest exceeds 256 KB.");
  const manifest = parseCharacterPack(JSON.parse(await manifestFile.text())),
    assets: Record<string, Blob> = Object.create(null);
  const root = manifestFile.webkitRelativePath
    ? manifestFile.webkitRelativePath.slice(0, -manifestFile.name.length)
    : "";
  const entries = new Map(
    files.map((f) => [
      f.webkitRelativePath ? f.webkitRelativePath.slice(root.length) : f.name,
      f,
    ]),
  );
  let total = 0,
    pixels = 0,
    checked = 0;
  const values = Object.entries(manifest.assets);
  for (const [id, asset] of values) {
    const path = packPath(asset.path),
      file = entries.get(path);
    if (!file) throw Error(`Missing character asset: ${path}`);
    total += file.size;
    if (total > 128 * 1024 * 1024)
      throw Error("Referenced character assets exceed 128 MB.");
    if (asset.type === "image") {
      if (!/\.(?:png|webp|jpe?g)$/i.test(path) || file.size > 32 * 1024 * 1024)
        throw Error(
          "Artwork must be PNG, WebP or JPEG, below 32 MB per image.",
        );
      const head = new Uint8Array(await file.slice(0, 24).arrayBuffer());
      const png =
        head.length >= 24 &&
        head[0] === 137 &&
        head[1] === 80 &&
        head[2] === 78 &&
        head[3] === 71;
      const jpeg =
        head.length >= 3 &&
        head[0] === 255 &&
        head[1] === 216 &&
        head[2] === 255;
      const webp =
        head.length >= 12 &&
        String.fromCharCode(...head.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...head.slice(8, 12)) === "WEBP";
      if (!png && !jpeg && !webp)
        throw Error(
          "Artwork contents must be PNG, WebP or JPEG, not SVG or another file type.",
        );
      if (png) {
        const header = new DataView(head.buffer),
          w = header.getUint32(16),
          h = header.getUint32(20);
        if (w > 8192 || h > 8192 || w * h + pixels > 32_000_000)
          throw Error("Artwork exceeds the decoded image budget.");
      }
      const image = await createImageBitmap(file);
      try {
        pixels += image.width * image.height;
        if (image.width > 8192 || image.height > 8192 || pixels > 32_000_000)
          throw Error(
            "Artwork exceeds the decoded image budget (32 million pixels).",
          );
        if (
          asset.grid &&
          (image.width % asset.grid.columns || image.height % asset.grid.rows)
        )
          throw Error(
            `${path}: grid cells must have whole-pixel dimensions. Use explicit rect frames for an irregular atlas.`,
          );
        for (const frame of Object.values(manifest.frames).filter(
          (f) => f.asset === id,
        )) {
          if (
            frame.rect &&
            (frame.rect[0] + frame.rect[2] > image.width ||
              frame.rect[1] + frame.rect[3] > image.height)
          )
            throw Error(`${path}: a frame rectangle extends beyond the image.`);
        }
      } finally {
        image.close();
      }
    } else if (asset.type === "vrm") {
      if (!/\.vrm$/i.test(path) || file.size > 50 * 1024 * 1024)
        throw Error("VRM files must be below 50 MB.");
      inspectVrm(await file.arrayBuffer());
    } else {
      if (!/\.wav$/i.test(path) || file.size > 8 * 1024 * 1024)
        throw Error("Voice references must be WAV files below 8 MB.");
      const audio = new AudioContext();
      try {
        const buffer = await audio.decodeAudioData(await file.arrayBuffer());
        if (
          buffer.duration < 3 ||
          buffer.duration > 30 ||
          buffer.numberOfChannels > 2
        )
          throw Error("Voice references must be 3-30 seconds, mono or stereo.");
      } finally {
        await audio.close();
      }
    }
    assets[id] = file;
    progress(Math.round((++checked / values.length) * 90));
  }
  const result: SavedPack = {
      id: crypto.randomUUID(),
      manifest,
      assets,
      importedAt: Date.now(),
    },
    d = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = d.transaction("characters", "readwrite"),
        s = t.objectStore("characters");
      s.put(result, "pack:" + result.id);
      s.put(
        { id: result.id, manifest, importedAt: result.importedAt },
        "packmeta:" + result.id,
      );
      t.oncomplete = () => resolve();
      t.onerror = () =>
        reject(
          Error(
            "Character could not be saved. Existing characters were preserved.",
          ),
        );
    });
  } finally {
    d.close();
  }
  progress(100);
  changed();
  return result;
}

export async function packInfo(id: string): Promise<PackSummary | null> {
  const d = await db();
  try {
    return await new Promise((resolve, reject) => {
      const r = d
        .transaction("characters")
        .objectStore("characters")
        .get("packmeta:" + id);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(Error("Cannot read character metadata"));
    });
  } finally {
    d.close();
  }
}
