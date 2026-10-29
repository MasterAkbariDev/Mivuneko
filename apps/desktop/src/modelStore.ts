import { inspectVrm, type VrmInfo } from "../../../packages/character/packs.ts";
export interface SavedModel {
  id: string;
  info: VrmInfo;
  importedAt: number;
  voice: null;
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("mivuneko.assets", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("characters");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(Error("Character storage is unavailable"));
  });
}
function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(Error("Cannot read saved characters"));
  });
}
function changed() {
  const c = new BroadcastChannel("mivuneko.assets");
  c.postMessage("model-changed");
  c.close();
}
function selected() {
  try {
    return (
      JSON.parse(localStorage.getItem("mivuneko.preferences.v1") || "{}")
        .customModelId || ""
    );
  } catch {
    return "";
  }
}
export async function listModels(): Promise<SavedModel[]> {
  const db = await database();
  try {
    const legacy = await request(
      db.transaction("characters").objectStore("characters").get("vrm"),
    );
    if (legacy instanceof ArrayBuffer) {
      const info = inspectVrm(legacy);
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction("characters", "readwrite"),
          s = t.objectStore("characters");
        s.put(legacy, "model:legacy-vrm");
        s.put(
          { id: "legacy-vrm", info, importedAt: Date.now(), voice: null },
          "meta:legacy-vrm",
        );
        s.delete("vrm");
        t.oncomplete = () => resolve();
        t.onerror = () => reject(Error("Cannot migrate saved character"));
      });
    }
    return await new Promise((resolve, reject) => {
      const out: SavedModel[] = [],
        r = db
          .transaction("characters")
          .objectStore("characters")
          .openCursor(IDBKeyRange.bound("meta:", "meta:\uffff"));
      r.onsuccess = () => {
        const c = r.result;
        if (!c) return resolve(out.sort((a, b) => a.importedAt - b.importedAt));
        if (String(c.key).startsWith("meta:")) out.push(c.value);
        c.continue();
      };
      r.onerror = () => reject(Error("Cannot list saved characters"));
    });
  } finally {
    db.close();
  }
}
export async function storedModel(
  id = selected(),
): Promise<ArrayBuffer | null> {
  const models = await listModels();
  const key = id || models[0]?.id;
  if (!key) return null;
  const db = await database();
  try {
    const value = await request(
      db
        .transaction("characters")
        .objectStore("characters")
        .get("model:" + key),
    );
    return value instanceof ArrayBuffer ? value : null;
  } finally {
    db.close();
  }
}
export async function removeModel(id: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("characters", "readwrite"),
        s = t.objectStore("characters");
      s.delete("model:" + id);
      s.delete("meta:" + id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(Error("Could not remove character"));
    });
    changed();
  } finally {
    db.close();
  }
}
export async function saveModel(model: ArrayBuffer | null): Promise<string> {
  if (!model) {
    const id = selected() || (await listModels())[0]?.id;
    if (id) await removeModel(id);
    return "";
  }
  const info = inspectVrm(model),
    id = crypto.randomUUID(),
    db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("characters", "readwrite"),
        s = t.objectStore("characters");
      s.put(model, "model:" + id);
      s.put({ id, info, importedAt: Date.now(), voice: null }, "meta:" + id);
      t.oncomplete = () => resolve();
      t.onerror = () =>
        reject(
          Error(
            "Character could not be saved; existing characters were preserved",
          ),
        );
    });
    changed();
    return id;
  } finally {
    db.close();
  }
}
