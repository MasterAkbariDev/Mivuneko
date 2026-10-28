import { Icon } from "./Icon";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isNative } from "./broker";
import { updatePreferences, usePreferences } from "./preferences";
interface Status {
  configured: boolean;
  keyCount: number;
  proxyEnabled: boolean;
  chatModel: string;
}
interface TestResult {
  index: number;
  ok: boolean;
  message: string;
}
// Session memory only: tab navigation must not discard drafts or diagnostics.
const session = {
  busy: "",
  keys: "",
  proxy: "",
  chatModel: "gemini-3.8-flash",
  speechModel: "gemini-3.8-flash-tts",
  voice: "Kore",
  results: [] as TestResult[],
  proxyResult: "",
  message: "",
};
let snapshot = { ...session };
const listeners = new Set<() => void>();
export function GeminiSettings() {
  const prefs = usePreferences();
  const draft = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => snapshot,
  );
  const [status, setStatus] = useState<Status | null>(null);
  const busy = draft.busy;
  const setBusy = (busy: string) => patch({ busy });
  function patch(change: Partial<typeof session>) {
    Object.assign(session, change);
    snapshot = { ...session };
    listeners.forEach((listener) => listener());
  }
  const credentials = [
    ...new Set(
      draft.keys
        .split(/\r?\n/)
        .map((k) => k.trim())
        .filter(Boolean),
    ),
  ];
  useEffect(() => {
    if (isNative)
      void import("@tauri-apps/api/core")
        .then(({ invoke }) => invoke<Status>("gemini_status"))
        .then(setStatus)
        .catch(() =>
          patch({ message: "Could not read native connection status." }),
        );
  }, []);
  function config(proxyOnly = false) {
    return {
      keys: (proxyOnly ? ["proxy-diagnostic-only"] : credentials).map(
        (key) => ({ key, project: "shared" }),
      ),
      proxy: draft.proxy.trim(),
      chatModel: proxyOnly ? "diagnostic" : draft.chatModel.trim(),
      speechModel: proxyOnly ? "diagnostic" : draft.speechModel.trim(),
      voice: proxyOnly ? "diagnostic" : draft.voice.trim(),
    };
  }
  async function test(proxyOnly: boolean) {
    setBusy(proxyOnly ? "proxy" : "keys");
    patch(
      proxyOnly
        ? { proxyResult: "Testing HTTPS through this proxy…" }
        : {
            results: [],
            message: "Testing each key with the selected chat model…",
          },
    );
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      if (proxyOnly) {
        const result = await invoke<TestResult[]>("test_gemini_connection", {
          config: config(true),
          proxyOnly: true,
        });
        patch({
          proxyResult: `${result[0].ok ? "Connected" : "Failed"} · ${result[0].message}`,
        });
      } else {
        let results: TestResult[] = [];
        for (let index = 0; index < credentials.length; index++) {
          let result: TestResult[];
          try {
            result = await invoke<TestResult[]>("test_gemini_connection", {
              config: {
                ...config(),
                keys: [{ key: credentials[index], project: "shared" }],
              },
              proxyOnly: false,
            });
          } catch {
            result = [
              {
                index,
                ok: false,
                message:
                  "Test failed · check key formatting or native connection",
              },
            ];
          }
          results = [...results, { ...result[0], index }];
          patch({ results });
        }
        patch({
          message: `${results.filter((r) => r.ok).length} of ${credentials.length} keys working. Authentication and model access checked; generation quota and speech are not tested.`,
        });
      }
    } catch {
      patch(
        proxyOnly
          ? {
              proxyResult:
                "Test failed. Check the proxy URL and desktop connection.",
            }
          : {
              message:
                "Test failed. Check key formatting, model names and native connection.",
            },
      );
    } finally {
      setBusy("");
    }
  }
  async function save() {
    setBusy("save");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      setStatus(await invoke<Status>("configure_gemini", { config: config() }));
      updatePreferences({ backend: "gemini", voiceProvider: "gemini" });
      patch({
        message:
          "Configuration applied. Keys and proxy stay available throughout this app session.",
      });
    } catch {
      patch({
        message:
          "Could not apply configuration. Check keys, proxy URL and model names.",
      });
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="provider-card" aria-label="Gemini connection">
      <div className="provider-heading">
        <span className="provider-mark" aria-hidden="true">
          <Icon name="link" />
        </span>
        <div>
          <h3>Gemini connection</h3>
          <small>
            {status?.configured
              ? `${status.keyCount} keys configured · ${status.proxyEnabled ? "proxy on" : "direct HTTPS"}`
              : "Your keys. Your connection."}
          </small>
        </div>
      </div>
      <p>Connect chat, transcription and speech to Google Gemini.</p>
      <div className="field-heading">
        <h4>
          API keys <small>{credentials.length} / 16</small>
        </h4>
        <button
          disabled={
            !isNative ||
            !!busy ||
            !credentials.length ||
            credentials.length > 16
          }
          onClick={() => void test(false)}
        >
          {busy === "keys" ? "Testing keys…" : "Test all keys"}
        </button>
      </div>
      <div className="key-list" aria-live="polite">
        {credentials.map((key, index) => {
          const result = draft.results.find((r) => r.index === index);
          return (
            <div className="key-row" key={index}>
              <span className="key-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <code>
                {key.length > 8
                  ? `${key.slice(0, 4)}••••••••${key.slice(-4)}`
                  : `${key.slice(0, 1)}••••${key.slice(-1)}`}
              </code>
              <span
                className={
                  result
                    ? result.ok
                      ? "test-success"
                      : "test-failure"
                    : "test-pending"
                }
              >
                {result?.message ?? "Not tested"}
              </span>
            </div>
          );
        })}
      </div>
      <label className="provider-field">
        API keys · one key per line
        <textarea
          aria-label="Gemini API keys"
          autoComplete="off"
          spellCheck={false}
          disabled={!!busy}
          value={draft.keys}
          onChange={(e) =>
            patch({ keys: e.target.value, results: [], message: "" })
          }
          placeholder="Paste your API keys here"
        />
      </label>
      <p className="hint">
        First and last four characters stay visible above. Duplicate keys and
        blank lines are ignored. Keys rotate automatically.
      </p>
      <div className="field-heading">
        <h4>Connection route</h4>
        <button
          disabled={!isNative || !!busy || !draft.proxy.trim()}
          onClick={() => void test(true)}
        >
          {busy === "proxy" ? "Testing proxy…" : "Test proxy"}
        </button>
      </div>
      <label className="provider-field">
        HTTP / SOCKS proxy
        <input
          aria-label="Gemini proxy"
          type="text"
          autoComplete="off"
          spellCheck={false}
          disabled={!!busy}
          value={draft.proxy}
          onChange={(e) =>
            patch({
              proxy: e.target.value,
              proxyResult: "",
              results: [],
              message: "",
            })
          }
          placeholder="socks5h://127.0.0.1:1080"
        />
      </label>
      <p className="hint">
        Leave empty for direct HTTPS. All Gemini requests use this route, with
        no direct fallback.
      </p>
      {draft.proxyResult && (
        <p className="connection-result" role="status">
          {draft.proxyResult}
        </p>
      )}
      <div className="provider-grid">
        {(
          [
            ["chatModel", "Chat / transcription model", "Gemini chat model"],
            ["speechModel", "Speech model", "Gemini speech model"],
            ["voice", "Voice name", "Gemini voice"],
          ] as const
        ).map(([field, label, aria]) => (
          <label className="provider-field" key={field}>
            {label}
            <input
              aria-label={aria}
              disabled={!!busy}
              value={draft[field]}
              onChange={(e) =>
                patch({ [field]: e.target.value, results: [], message: "" })
              }
            />
          </label>
        ))}
      </div>
      <div className="actions">
        <button
          disabled={!isNative || !!busy}
          onClick={async () => {
            setBusy("clear");
            try {
              const { invoke } = await import("@tauri-apps/api/core");
              await invoke("clear_gemini");
              setStatus(null);
              patch({
                keys: "",
                results: [],
                message: "Keys cleared. Proxy settings retained.",
              });
            } catch {
              patch({ message: "Could not clear native credentials." });
            } finally {
              setBusy("");
            }
          }}
        >
          Clear keys
        </button>
        <button
          className="primary"
          disabled={
            !isNative ||
            !!busy ||
            !credentials.length ||
            credentials.length > 16
          }
          onClick={() => void save()}
        >
          {busy === "save" ? "Applying…" : "Apply Gemini configuration"}
        </button>
      </div>
      <p role="status">{draft.message}</p>
      {!isNative && (
        <p className="hint">
          Connection tests run in the desktop app. Browser preview keeps your
          drafts but cannot send provider requests.
        </p>
      )}
      <label className="setting">
        Voice provider
        <select
          aria-label="Voice provider"
          value={prefs.voiceProvider}
          onChange={(e) =>
            updatePreferences({
              voiceProvider: e.target.value as typeof prefs.voiceProvider,
            })
          }
        >
          <option value="local">Local whisper.cpp + macOS voice</option>
          <option value="gemini">Gemini speech + transcription</option>
        </select>
      </label>
      <p className="hint">
        Session only. Keys and drafts remain when switching tabs and are cleared
        when the app closes. Recording begins when you press the microphone.
      </p>
    </section>
  );
}
