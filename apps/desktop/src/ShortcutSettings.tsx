import { useEffect, useState } from "react";
import { defaults, updatePreferences, usePreferences } from "./preferences";
import { shortcutFor } from "../../../packages/shared-schemas/shortcuts.ts";
const actions = {
  record: [
    "Start / finish recording",
    "Toggle open mic or finish the current recording.",
  ],
  stop: ["Stop everything", "Stop speech, recording and the current request."],
  chat: ["Open conversation", "Return to your conversation."],
  characters: ["Character studio", "Open your 2D and 3D companions."],
  reset: [
    "Find & reset pet",
    "Restore a safe size and bring your companion back on-screen.",
  ],
  edit: [
    "Edit pet",
    "Unlock dragging and scroll to resize. Locked by default.",
  ],
  clickThrough: [
    "Click through pet",
    "Pass every click to the app underneath.",
  ],
  focus: ["Focus mode", "Keep your companion still and quiet."],
  screen: ["Screen help", "Open a preview before sharing your screen."],
  settings: ["Open settings", "Jump to your preferences."],
};
export function ShortcutSettings() {
  const p = usePreferences();
  const [error, setError] = useState("");
  const [capture, setCapture] = useState("");
  useEffect(() => {
    const f = (e: Event) =>
      setError(((e as CustomEvent).detail as string[]).join(" · "));
    window.addEventListener("shortcut-status", f);
    return () => window.removeEventListener("shortcut-status", f);
  }, []);
  return (
    <section className="settings-group" aria-label="Keyboard shortcuts">
      <span className="eyebrow">MAKE IT YOURS</span>
      <h3>One shortcut away</h3>
      <p className="hint">
        Click a shortcut, then press a new combination. Shortcuts work across
        your desktop, even after closing the conversation window. Quit Mivuneko
        to stop them.
      </p>
      {Object.entries(actions).map(([action, [name, detail]]) => (
        <div className="shortcut-row" key={action}>
          <div>
            <strong>{name}</strong>
            <small>{detail}</small>
          </div>
          <input
            readOnly
            data-shortcut-capture="true"
            aria-label={`${name} shortcut`}
            value={
              capture === action
                ? "Press keys…"
                : p.shortcuts[action as keyof typeof p.shortcuts]
            }
            onFocus={() => {
              setCapture(action);
              if ("__TAURI_INTERNALS__" in window)
                void import("@tauri-apps/api/core").then(({ invoke }) =>
                  invoke("configure_global_shortcuts", { bindings: {} }),
                );
            }}
            onBlur={() => {
              setCapture("");
              if ("__TAURI_INTERNALS__" in window)
                void import("@tauri-apps/api/core").then(({ invoke }) =>
                  invoke("configure_global_shortcuts", {
                    bindings:
                      JSON.parse(
                        localStorage.getItem("mivuneko.preferences.v1") ?? "{}",
                      ).shortcuts ?? p.shortcuts,
                  }),
                );
            }}
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const value = shortcutFor(e);
              if (!value) return;
              if (
                !e.altKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                e.key !== "Escape" &&
                !/^F\d+$/.test(e.key)
              ) {
                setError(
                  "Use Ctrl, Alt or Command with a key, or a function key.",
                );
                return;
              }
              if (
                Object.entries(p.shortcuts).some(
                  ([key, chord]) =>
                    key !== action &&
                    chord.toLowerCase() === value.toLowerCase(),
                )
              ) {
                setError(
                  "That shortcut is already assigned. Choose another combination.",
                );
                return;
              }
              if (
                !/^(?:(?:Ctrl|Alt|Shift|Meta)\+){0,4}(?:[A-Z0-9,./;]|Escape|F\d{1,2})$/.test(
                  value,
                )
              ) {
                setError(
                  "Choose a letter, number, function key, comma, period or slash.",
                );
                return;
              }
              setError("");
              updatePreferences({
                shortcuts: { ...p.shortcuts, [action]: value },
              });
              setCapture("");
              e.currentTarget.blur();
            }}
          />
        </div>
      ))}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          updatePreferences({ shortcuts: { ...defaults.shortcuts } });
          setError("");
        }}
      >
        Restore default shortcuts
      </button>
    </section>
  );
}
