import { GeminiSettings } from "./GeminiSettings";
import { useState } from "react";
import { usePreferences, updatePreferences } from "./preferences";
import { isNative } from "./broker";
export function BackendSettings() {
  const p = usePreferences();
  const [status, setStatus] = useState("");
  return (
    <section>
      <h3>Reasoning and conversation history</h3>
      <label className="setting">
        Agent backend
        <select
          aria-label="Agent backend"
          value={p.backend}
          onChange={(e) =>
            updatePreferences({ backend: e.target.value as typeof p.backend })
          }
        >
          <option value="auto" disabled={!isNative}>
            Automatic · Gemini + Groq
          </option>
          <option value="offline">Offline demo</option>
          <option value="hermes" disabled={!isNative}>
            Local Hermes Agent
          </option>
        </select>
      </label>
      {p.backend === "auto" && (
        <p className="hint">
          Configured Gemini and Groq providers alternate between turns. If one
          fails, the other is tried; no duplicate simultaneous requests.
          Conversation text is sent to the selected provider.
        </p>
      )}
      {p.backend === "hermes" && (
        <>
          <p className="hint">
            Hermes sends text and recent conversation history to your configured
            model provider. Use a dedicated tool-free Hermes profile; desktop
            actions stay behind Mivuneko approval.
          </p>
          <button
            disabled={!isNative}
            onClick={async () => {
              setStatus("Checking local Hermes…");
              try {
                const { invoke } = await import("@tauri-apps/api/core");
                setStatus(await invoke<string>("hermes_status"));
              } catch (e) {
                setStatus(String(e));
              }
            }}
          >
            Test Hermes connection
          </button>
          <p role="status">{status}</p>
        </>
      )}
      <GeminiSettings />
      <label className="setting">
        Remember conversations on this device
        <input
          type="checkbox"
          checked={p.rememberHistory}
          onChange={(e) =>
            updatePreferences({ rememberHistory: e.target.checked })
          }
        />
      </label>
      <p className="hint">
        Opt-in text history only. Native desktop uses a local SQLite database;
        browser demo uses this browser’s storage. Turning this off deletes saved
        history. No provider keys are stored here.
      </p>
    </section>
  );
}
