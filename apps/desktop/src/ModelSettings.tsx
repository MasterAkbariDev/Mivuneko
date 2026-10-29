import { useEffect, useRef, useState } from "react";
import { updatePreferences, usePreferences } from "./preferences";
import {
  listModels,
  removeModel,
  saveModel,
  type SavedModel,
} from "./modelStore";
import {
  inspectVrm,
  validateVrmFile,
} from "../../../packages/character/packs.ts";
export function ModelSettings({ only3D = false }: { only3D?: boolean }) {
  const p = usePreferences(),
    input = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<SavedModel[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = () =>
    listModels()
      .then(setModels)
      .catch((e) => setError(String(e)));
  useEffect(() => {
    void refresh();
    const c = new BroadcastChannel("mivuneko.assets");
    c.onmessage = () => void refresh();
    return () => c.close();
  }, []);
  async function upload(files: FileList) {
    setBusy(true);
    setError("");
    const errors: string[] = [];
    try {
      for (const file of Array.from(files)) {
        try {
          validateVrmFile(file.name, file.size);
          const bytes = await file.arrayBuffer(),
            info = inspectVrm(bytes),
            id = await saveModel(bytes);
          updatePreferences({
            activePackId: "",
            activePackName: "",
            renderer: "custom-vrm",
            customModelId: id,
            customModelName: info.name,
          });
        } catch (e) {
          errors.push(`${file.name}: ${String(e)}`);
        }
      }
      await refresh();
      setError(errors.join("\n"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function remove(id: string) {
    try {
      await removeModel(id);
      const remaining = await listModels();
      setModels(remaining);
      if (
        p.renderer === "custom-vrm" &&
        !p.activePackId &&
        (p.customModelId === id || (!p.customModelId && models[0]?.id === id))
      ) {
        const next = remaining[0];
        updatePreferences(
          next
            ? { customModelId: next.id, customModelName: next.info.name }
            : {
                activePackId: "",
                activePackName: "",
                renderer: "sample-vrm",
                customModelId: "",
                customModelName: "",
              },
        );
      }
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <section
      className="model-settings settings-group"
      aria-label="3D character manager"
    >
      <span className="eyebrow">YOUR CHARACTER LIBRARY</span>
      <h3>3D companions</h3>
      <p className="hint">
        Every import gets its own slot. Your existing characters stay in the
        library. A VRM supplies the model, not a voice.
      </p>
      <div
        className="format-options"
        role="group"
        aria-label="Character renderer"
      >
        {!only3D && (
          <button
            onClick={() =>
              updatePreferences({
                activePackId: "",
                activePackName: "",
                renderer: "2d",
              })
            }
            aria-pressed={p.renderer === "2d"}
          >
            <b>2D illustration</b>
            <small>Original poses & mood effects</small>
          </button>
        )}
        <button
          onClick={() =>
            updatePreferences({
              activePackId: "",
              activePackName: "",
              renderer: "sample-vrm",
            })
          }
          aria-pressed={p.renderer === "sample-vrm"}
        >
          <b>Haru · 3D</b>
          <small>Expressions, gestures & character voice</small>
        </button>
        {models.map((m) => (
          <div className="imported-character" key={m.id}>
            <button
              aria-pressed={
                p.renderer === "custom-vrm" &&
                (p.customModelId === m.id ||
                  (!p.customModelId && m.id === models[0]?.id))
              }
              onClick={() =>
                updatePreferences({
                  activePackId: "",
                  activePackName: "",
                  renderer: "custom-vrm",
                  customModelId: m.id,
                  customModelName: m.info.name,
                })
              }
            >
              <b>Your VRM model · {m.info.name}</b>
              <small>By {m.info.authors}</small>
              <small>{m.info.expressions.length} expression presets</small>
              <small>Silent · no voice definition</small>
            </button>
            <button
              className="quiet-button"
              aria-label={`Remove ${m.info.name} ${m.id}`}
              onClick={() => void remove(m.id)}
            >
              Remove from library
            </button>
          </div>
        ))}
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept=".vrm"
        className="sr"
        aria-label="Import VRM file"
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files);
        }}
      />
      <div className="model-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? "Importing characters…" : "Import VRM character"}
        </button>
      </div>
      <p className="hint">
        Select one or more .vrm files. Files stay on this device. Importing the
        same file again creates another slot. Removing one slot leaves the
        others intact.
      </p>
      {p.renderer === "sample-vrm" && (
        <p className="hint">
          Haru uses AvatarSample_B by VRoid Project / pixiv, with original usage
          terms preserved.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
