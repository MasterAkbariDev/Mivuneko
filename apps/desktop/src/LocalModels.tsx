import { CustomSelect } from "./CustomSelect";
import { useEffect, useState } from "react";
import { isNative } from "./broker";
import { usePreferences, updatePreferences } from "./preferences";
export function LocalModels() {
  const p = usePreferences();
  const [models, setModels] = useState<string[]>([]),
    [status, setStatus] = useState(""),
    [installing, setInstalling] = useState(false),
    [storage, setStorage] = useState<any>(null),
    [storageRoot, setStorageRoot] = useState(""),
    [storageBusy, setStorageBusy] = useState(false),
    [confirmRemoval, setConfirmRemoval] = useState(false),
    [runtime, setRuntime] = useState<{
      installed: boolean;
      voiceReady: boolean;
    } | null>(null);
  async function refresh() {
    setStatus("Checking local models…");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const [r, m] = await Promise.allSettled([
        invoke<any>("local_runtime_status"),
        invoke<any>("ollama_models"),
      ]);
      if (r.status === "fulfilled") setRuntime(r.value);
      if (r.status === "fulfilled" && r.value?.installed) {
        try {
          setStorage(
            await invoke("local_voice_storage", { action: "inventory" }),
          );
        } catch {
          /* Voice remains usable if disk inventory is unavailable. */
        }
      }
      const available = m.status === "fulfilled" ? (m.value?.models ?? []) : [];
      setModels(available.map((v: any) => v.name));
      setStatus(
        `${m.status === "fulfilled" ? available.length + " installed models" : "Ollama is not running"} · ${r.status === "fulfilled" && r.value?.voiceReady ? "expressive voice ready" : "voice setup needed"}`,
      );
    } catch (e) {
      setStatus(String(e));
    }
  }
  useEffect(() => {
    if (isNative) void refresh();
  }, []);
  async function install() {
    setInstalling(true);
    setStatus("Preparing the local runtime…");
    const { listen } = await import("@tauri-apps/api/event");
    const off = await listen<{ stage: string }>("local-runtime-progress", (e) =>
      setStatus(e.payload.stage),
    );
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("install_local_runtime", {
        storageRoot: storageRoot.trim() || null,
      });
      await refresh();
    } catch (e) {
      setStatus(String(e));
    } finally {
      off();
      setInstalling(false);
    }
  }
  async function manageStorage(action: "cleanup" | "remove-expressive") {
    setStorageBusy(true);
    setStatus(
      action === "cleanup"
        ? "Verifying voice before cleaning downloads…"
        : "Removing the optional expressive model…",
    );
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<any>("local_voice_storage", { action });
      if (action === "remove-expressive" && p.voiceProvider === "qwen")
        updatePreferences({ voiceProvider: "local" });
      await refresh();
      setStatus(
        `Freed ${gb(result.freedBytes)}.${result.warnings?.length ? " Some files were retained: " + result.warnings.join("; ") : " Your voice profiles and personal data were preserved."}`,
      );
      setConfirmRemoval(false);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setStorageBusy(false);
    }
  }
  const gb = (bytes: number) =>
    `${((bytes || 0) / 1_000_000_000).toFixed(2)} GB`;
  return (
    <section className="settings-group" aria-label="Local models">
      <h3>Local models</h3>
      <p className="hint">
        Conversation, screen understanding and computer sessions can run through
        Ollama on this device. Fast character voice runs on the CPU. Qwen3-TTS
        offers experimental expressive delivery with longer preparation and
        higher GPU use.
      </p>
      <label className="setting">
        Ollama model
        <CustomSelect
          aria-label="Ollama model"
          value={p.ollamaModel}
          onChange={(e) => updatePreferences({ ollamaModel: e.target.value })}
        >
          {!models.includes(p.ollamaModel) && <option>{p.ollamaModel}</option>}
          {models.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </CustomSelect>
      </label>
      <div className="local-model-actions">
        <button disabled={!isNative} onClick={() => void refresh()}>
          Refresh local models
        </button>
        <button
          disabled={!models.length}
          onClick={() => updatePreferences({ backend: "ollama" })}
        >
          Use local conversation
        </button>
        {runtime?.installed && (
          <button onClick={() => updatePreferences({ voiceProvider: "local" })}>
            Use fast character voice
          </button>
        )}
        {runtime?.voiceReady && (
          <button onClick={() => updatePreferences({ voiceProvider: "qwen" })}>
            Use experimental expressive voice
          </button>
        )}
        {
          <button
            disabled={!isNative || installing || storageBusy}
            onClick={() => void install()}
          >
            {installing
              ? "Installing local runtime…"
              : runtime?.installed
                ? "Update local runtime"
                : "Install expressive voice & computer runtime · up to 13 GB"}
          </button>
        }
      </div>
      <details className="voice-storage">
        <summary>
          Local voice storage
          {storage
            ? ` · ${gb(storage.runtimeBytes + storage.speechBytes)}`
            : ""}
        </summary>
        <p className="hint">
          Voice engines and models are optional downloads. Character voice
          profiles, recordings, conversations and settings are kept separately
          and are never cleaned here.
        </p>
        {storage && (
          <p>
            Runtime {gb(storage.runtimeBytes)} · Speech{" "}
            {gb(storage.speechBytes)} · Reclaimable downloads and old versions{" "}
            {gb(storage.reclaimableBytes)}
          </p>
        )}
        {storage?.runtimeRoot && (
          <p className="hint" style={{ overflowWrap: "anywhere" }}>
            {storage.runtimeRoot}
          </p>
        )}
        <label className="setting">
          Install location
          <input
            aria-label="Local runtime install location"
            placeholder={storage?.runtimeRoot || "Default app storage"}
            value={storageRoot}
            onChange={(e) => setStorageRoot(e.target.value)}
            disabled={installing || storageBusy}
          />
        </label>
        <p className="hint">
          Use an absolute folder path on a drive with free space. Updates build
          a separate runtime there; existing model files are reused at their
          current location. This does not move existing files. Temporary free
          space is needed for both runtimes during an update.
        </p>
        <div className="local-model-actions">
          <button
            disabled={
              !isNative || !runtime?.installed || installing || storageBusy
            }
            onClick={() => void manageStorage("cleanup")}
          >
            {storageBusy
              ? "Verifying storage…"
              : "Clean verified downloads & old versions"}
          </button>
          {!!storage?.modelBytes && (
            <button
              disabled={installing || storageBusy}
              onClick={() => setConfirmRemoval(true)}
            >
              Remove expressive model · {gb(storage.modelBytes)}
            </button>
          )}
        </div>
        {confirmRemoval && (
          <div role="group" aria-label="Confirm expressive voice removal">
            <p>
              Remove the downloaded Qwen voice model? Fast local voice and the
              computer runtime stay installed. You can download expressive voice
              again later.
            </p>
            <div className="local-model-actions">
              <button
                disabled={storageBusy}
                onClick={() => void manageStorage("remove-expressive")}
              >
                Remove model
              </button>
              <button
                disabled={storageBusy}
                onClick={() => setConfirmRemoval(false)}
              >
                Keep model
              </button>
            </div>
          </div>
        )}
      </details>
      <p role="status">{status}</p>
    </section>
  );
}
