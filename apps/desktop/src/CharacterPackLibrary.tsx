import { useEffect, useRef, useState } from "react";
import {
  importPack,
  listPacks,
  removePack,
  type PackSummary,
} from "./characterPackStore";
import { updatePreferences, usePreferences } from "./preferences";
import type { CharacterFormat } from "../../../packages/shared-schemas/character-pack";
export function CharacterPackLibrary({
  format,
  onImported,
}: {
  format: CharacterFormat;
  onImported: (format: CharacterFormat) => void;
}) {
  const p = usePreferences(),
    input = useRef<HTMLInputElement>(null);
  const [packs, setPacks] = useState<PackSummary[]>([]),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState("");
  const refresh = () =>
    listPacks()
      .then(setPacks)
      .catch((e) => setError(String(e)));
  useEffect(() => {
    input.current?.setAttribute("webkitdirectory", "");
    void refresh();
    const c = new BroadcastChannel("mivuneko.assets");
    c.onmessage = () => void refresh();
    return () => c.close();
  }, []);
  function select(pack: PackSummary) {
    updatePreferences({
      activePackId: pack.id,
      activePackName: pack.manifest.name,
      customPackPose: "",
      renderer: pack.manifest.format === "3d" ? "custom-vrm" : "2d",
      illustrationDepth: pack.manifest.format === "2.5d",
    });
  }
  async function upload(files: FileList) {
    setBusy(true);
    setProgress(0);
    setError("");
    try {
      const pack = await importPack(Array.from(files), setProgress);
      await refresh();
      select(pack);
      onImported(pack.manifest.format);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function remove(id: string) {
    try {
      await removePack(id);
      if (p.activePackId === id)
        updatePreferences({
          activePackId: "",
          activePackName: "",
          customPackPose: "",
          renderer: format === "3d" ? "sample-vrm" : "2d",
          character: format === "2.5d" ? "mochi" : "luna",
          illustrationDepth: format === "2.5d",
        });
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <section
      className="settings-group pack-library"
      aria-label="Imported character packs"
    >
      <div className="pack-library-head">
        <div>
          <h3>Your character packs</h3>
          <p className="hint">
            Each imported folder adds a separate character. Include
            character.json, artwork or VRM, and any voice reference.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Import character folder
        </button>
      </div>
      <input
        type="file"
        multiple
        ref={input}
        className="sr"
        aria-label="Import character folder"
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files);
        }}
      />
      {busy && (
        <div className="pack-import-progress" role="status">
          <progress max={100} value={progress} />
          <span>Checking and saving character · {progress}%</span>
        </div>
      )}
      <div className="imported-pack-grid">
        {packs
          .filter((pack) => pack.manifest.format === format)
          .map((pack) => (
            <article className="imported-pack-card" key={pack.id}>
              <button
                aria-pressed={p.activePackId === pack.id}
                onClick={() => select(pack)}
              >
                <b>{pack.manifest.name}</b>
                <small>By {pack.manifest.author}</small>
                <small>
                  {pack.manifest.format === "3d"
                    ? "VRM model"
                    : `${Object.keys(pack.manifest.poses).length} poses · ${Object.keys(pack.manifest.frames).length} frames`}
                </small>
                <small>
                  {pack.manifest.voice.kind === "none"
                    ? "Silent · no voice definition"
                    : pack.manifest.voice.kind === "reference"
                      ? "Voice reference saved · cloning engine planned"
                      : "Server voice prompt"}
                </small>
              </button>
              {p.activePackId === pack.id && pack.manifest.format !== "3d" && (
                <label>
                  Pose preview
                  <select
                    aria-label="Imported character pose"
                    value={p.customPackPose}
                    onChange={(e) =>
                      updatePreferences({ customPackPose: e.target.value })
                    }
                  >
                    <option value="">Automatic</option>
                    {Object.keys(pack.manifest.poses).map((pose) => (
                      <option key={pose} value={pose}>
                        {pose}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <small>{pack.manifest.license}</small>
              <button
                className="quiet-button"
                aria-label={`Remove pack ${pack.manifest.name} ${pack.id}`}
                onClick={() => void remove(pack.id)}
              >
                Remove from library
              </button>
            </article>
          ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
