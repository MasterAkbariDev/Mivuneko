import { useEffect, useSyncExternalStore } from "react";
import { isNative } from "./broker";
type Download = {
  engine: string;
  stage: string;
  received: number;
  total: number;
  active: boolean;
  error: string;
};
let state: Download | null = null;
const listeners = new Set<() => void>();
let clearTimer: ReturnType<typeof setTimeout> | undefined;
function publish(next: Download | null) {
  state = next;
  listeners.forEach((fn) => fn());
}
export function useSpeechDownload() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => state,
  );
}
function complete() {
  if (!state) return;
  publish({ ...state, active: false, stage: "Ready to use" });
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => publish(null), 5000);
}
export async function startSpeechDownload(engine: string) {
  if (state?.active) throw Error("A speech engine is already being installed.");
  clearTimeout(clearTimer);
  publish({
    engine,
    stage: "Preparing your download",
    received: 0,
    total: 0,
    active: true,
    error: "",
  });
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("install_voice_engine", { engine });
    complete();
  } catch (e) {
    if (state)
      publish({
        ...state,
        active: false,
        error: String(e),
        stage: "Setup could not finish",
      });
    throw e;
  }
}
export function SpeechDownloadDock() {
  const download = useSpeechDownload();
  useEffect(() => {
    if (!isNative) return;
    let disposed = false,
      off: (() => void) | undefined;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<{
          engine: string;
          stage: string;
          received: number;
          total: number;
        }>("voice-install-progress", (event) => {
          const p = event.payload;
          if (p.stage === "Ready to use") {
            if (state) complete();
            return;
          }
          if (p.stage.startsWith("Setup stopped")) {
            publish({ ...p, active: false, error: p.stage });
            return;
          }
          publish({ ...p, active: true, error: "" });
        }),
      )
      .then((fn) => {
        if (disposed) fn();
        else off = fn;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      off?.();
    };
  }, []);
  if (!download) return null;
  const percent = download.total
    ? Math.min(100, (download.received / download.total) * 100)
    : 0;
  return (
    <section
      className="speech-download-dock"
      aria-label="Speech download"
      role="status"
    >
      <div className="download-heading">
        <span className="download-icon">↓</span>
        <div>
          <strong>
            {download.engine.startsWith("kokoro")
              ? "Character voice"
              : download.engine.startsWith("parakeet")
                ? "Parakeet"
                : "Speech recognition"}
          </strong>
          <small>{download.stage}</small>
        </div>
        <button
          type="button"
          aria-label={
            download.active
              ? "Cancel speech download"
              : "Dismiss download status"
          }
          onClick={() =>
            download.active
              ? void import("@tauri-apps/api/core").then(({ invoke }) =>
                  invoke("cancel_voice_install"),
                )
              : publish(null)
          }
        >
          ×
        </button>
      </div>
      <div
        className={`download-track ${download.total ? "" : "indeterminate"}`}
        role="progressbar"
        aria-label="Download progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={download.total ? Math.round(percent) : undefined}
      >
        <div style={{ width: download.total ? `${percent}%` : "35%" }} />
      </div>
      <div className="download-meta">
        <span>
          {download.total
            ? `${(download.received / 1048576).toFixed(1)} / ${(download.total / 1048576).toFixed(1)} MB`
            : download.error
              ? "Please retry when ready"
              : "Preparing…"}
        </span>
        <b>
          {download.total
            ? `${Math.round(percent)}%`
            : download.active
              ? "Working"
              : ""}
        </b>
      </div>
      {download.error && <p className="error">{download.error}</p>}
    </section>
  );
}
