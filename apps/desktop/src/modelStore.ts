function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mivuneko.assets", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("characters");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(Error("Character storage is unavailable"));
  });
}
export async function storedModel(): Promise<ArrayBuffer | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction("characters")
        .objectStore("characters")
        .get("vrm");
      request.onsuccess = () =>
        resolve(request.result instanceof ArrayBuffer ? request.result : null);
      request.onerror = () => reject(Error("Cannot read saved character"));
    });
  } finally {
    db.close();
  }
}
export async function saveModel(model: ArrayBuffer | null) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("characters", "readwrite");
      const store = tx.objectStore("characters");
      if (model) store.put(model, "vrm");
      else store.delete("vrm");
      tx.oncomplete = () => {
        const channel = new BroadcastChannel("mivuneko.assets");
        channel.postMessage("model-changed");
        channel.close();
        resolve();
      };
      tx.onerror = () =>
        reject(
          Error("Character loaded for this session but could not be saved"),
        );
    });
  } finally {
    db.close();
  }
}
