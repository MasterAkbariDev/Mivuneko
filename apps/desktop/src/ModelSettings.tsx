import { useEffect, useRef, useState } from "react";
import { updatePreferences, usePreferences } from "./preferences";
import { saveModel, storedModel } from "./modelStore";
import {
  inspectVrm,
  validateVrmFile,
  type VrmInfo,
} from "../../../packages/character/packs.ts";
export function ModelSettings() {
  const p = usePreferences();
  const input = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<VrmInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void storedModel()
      .then((bytes) => bytes && setInfo(inspectVrm(bytes)))
      .catch(() => {});
  }, []);
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      validateVrmFile(file.name, file.size);
      const bytes = await file.arrayBuffer();
      const details = inspectVrm(bytes);
      await saveModel(bytes);
      setInfo(details);
      updatePreferences({ renderer: "custom-vrm" });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <section
      className="model-settings settings-group"
      aria-label="3D character manager"
    >
      <span className="eyebrow">CHARACTER FORMAT</span>
      <h3>Bring your companion to life</h3>
      <p className="hint">
        Choose illustrated 2D artwork or an animated VRM character. 3D
        characters support expressions, blinking, lip sync, gaze and spring-bone
        physics.
      </p>
      <div
        className="format-options"
        role="group"
        aria-label="Character renderer"
      >
        <button
          type="button"
          aria-pressed={p.renderer === "2d"}
          onClick={() => updatePreferences({ renderer: "2d" })}
        >
          <b>2D illustration</b>
          <small>Original poses & mood effects</small>
        </button>
        <button
          type="button"
          aria-pressed={p.renderer === "sample-vrm"}
          onClick={() => updatePreferences({ renderer: "sample-vrm" })}
        >
          <b>Haru · 3D</b>
          <small>Expressive VRoid companion</small>
        </button>
        <button
          type="button"
          aria-pressed={p.renderer === "custom-vrm"}
          onClick={() =>
            info
              ? updatePreferences({ renderer: "custom-vrm" })
              : input.current?.click()
          }
        >
          <b>Your VRM model</b>
          <small>{info?.name || "Import a .vrm file"}</small>
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".vrm"
        className="sr"
        aria-label="Import VRM file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <div className="model-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? "Importing model…" : "Import VRM character"}
        </button>
        {info && (
          <button
            type="button"
            onClick={() => {
              void saveModel(null)
                .then(() => {
                  setInfo(null);
                  updatePreferences({ renderer: "sample-vrm" });
                })
                .catch((e) => setError(String(e)));
            }}
          >
            Remove imported model
          </button>
        )}
      </div>
      {info && (
        <div className="model-attribution">
          <strong>{info.name}</strong>
          <small>By {info.authors}</small>
          <small>{info.license}</small>
          <small>
            {info.expressions.length} expression presets · stored on this device
          </small>
        </div>
      )}
      {p.renderer === "sample-vrm" && (
        <p className="hint">
          Haru uses AvatarSample_B by VRoid Project / pixiv. Included under the
          creator’s usage terms, with original permissions preserved.
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
