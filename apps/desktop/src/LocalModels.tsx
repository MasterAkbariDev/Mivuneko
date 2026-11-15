import { CustomSelect } from "./CustomSelect";
import { useEffect, useState } from "react";
import { isNative } from "./broker";
import { usePreferences, updatePreferences } from "./preferences";
export function LocalModels() {
  const p = usePreferences();
  const [models, setModels] = useState<string[]>([]),
    [status, setStatus] = useState(""),
    [installing, setInstalling] = useState(false),
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
      await invoke("install_local_runtime");
      await refresh();
    } catch (e) {
      setStatus(String(e));
    } finally {
      off();
      setInstalling(false);
    }
  }
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
      <button disabled={!isNative} onClick={() => void refresh()}>
        Refresh local models
      </button>
      <button
        disabled={!models.length}
        onClick={() => updatePreferences({ backend: "ollama" })}
      >
        Use local conversation
      </button>
      {runtime?.voiceReady && (
        <button onClick={() => updatePreferences({ voiceProvider: "local" })}>
          Use fast character voice
        </button>
      )}
      {runtime?.voiceReady && (
        <button onClick={() => updatePreferences({ voiceProvider: "qwen" })}>
          Use experimental expressive voice
        </button>
      )}
      {!runtime?.voiceReady && (
        <button
          disabled={!isNative || installing}
          onClick={() => void install()}
        >
          {installing
            ? "Installing local runtime…"
            : "Install expressive voice & computer runtime · about 8 GB"}
        </button>
      )}
      <button
        disabled={!runtime?.installed}
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent("mivuneko-open-computer", { detail: "" }),
          )
        }
      >
        Open computer session
      </button>
      <p role="status">{status}</p>
    </section>
  );
}
