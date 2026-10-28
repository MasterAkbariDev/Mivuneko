import { useState } from "react";
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
  settings: ["Open settings", "Jump to your preferences."],
};
export function ShortcutSettings() {
  const p = usePreferences();
  const [error, setError] = useState("");
  const [capture, setCapture] = useState("");
  return (
    <section className="settings-group" aria-label="Keyboard shortcuts">
      <span className="eyebrow">MAKE IT YOURS</span>
      <h3>One shortcut away</h3>
      <p className="hint">
        Click a shortcut, then press a new combination. Shortcuts work while
        Mivuneko is focused; they do not capture keys in other apps.
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
            onFocus={() => setCapture(action)}
            onBlur={() => setCapture("")}
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
