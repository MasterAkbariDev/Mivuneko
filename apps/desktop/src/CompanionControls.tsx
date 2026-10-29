import { companionName } from "./companionName";
import { useEffect, useState } from "react";
import { isNative } from "./broker";
import { updatePreferences, usePreferences } from "./preferences";
import { lunaModel } from "./lunaModel";
export function CompanionControls() {
  const p = usePreferences();
  const [monitors, setMonitors] = useState<string[]>([]);
  useEffect(() => {
    if (isNative)
      void import("@tauri-apps/api/window")
        .then(({ availableMonitors }) => availableMonitors())
        .then((items) =>
          setMonitors(
            items.map(
              (m) => `${m.name ?? "Display"}:${m.position.x}:${m.position.y}`,
            ),
          ),
        )
        .catch(() => {});
  }, []);
  return (
    <section
      className="companion-controls settings-group"
      aria-label="Companion controls"
    >
      <span className="eyebrow">DESKTOP PRESENCE</span>
      <h3>Your companion, your way</h3>
      <p className="hint">
        The desktop shows only your companion and optional captions. Use the
        tray menu → Show app, or your conversation shortcut. Right-click the
        character for quick controls.
      </p>
      <label className="setting">
        Companion name
        <input
          aria-label="Companion name"
          maxLength={40}
          value={p.companionName}
          placeholder={companionName({ ...p, companionName: "" })}
          onChange={(e) => updatePreferences({ companionName: e.target.value })}
        />
      </label>
      <label className="setting">
        Microphone status on the pet
        <input
          type="checkbox"
          checked={p.micIndicator}
          onChange={(e) =>
            updatePreferences({ micIndicator: e.target.checked })
          }
        />
      </label>
      <div className="setting">
        <span>Companion behavior</span>
        <strong>Automatic · conversation, movement and rest</strong>
      </div>
      <button
        type="button"
        aria-pressed={p.petMode === "auto"}
        onClick={() =>
          updatePreferences({ petMode: "auto", petAvoiding: false })
        }
      >
        {p.petMode === "auto"
          ? "Free roaming is active"
          : "Resume free roaming"}
      </button>
      <p className="hint">
        Say "be free" or "do your own thing" to resume. Ask your companion to
        walk somewhere, run, sit down or resume automatic behavior.
      </p>
      <label className="setting">
        Expression preview
        <select
          aria-label="Pet expression"
          value={p.petExpression}
          onChange={(e) =>
            updatePreferences({
              petExpression: e.target.value as typeof p.petExpression,
            })
          }
        >
          <option value="auto">Automatic</option>
          {Object.keys(lunaModel.poses).map((pose) => (
            <option key={pose} value={pose}>
              {pose.charAt(0).toUpperCase() + pose.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <label className="setting">
        Hearts, sparkles & mood effects
        <input
          type="checkbox"
          checked={p.petEffects}
          onChange={(e) => updatePreferences({ petEffects: e.target.checked })}
        />
      </label>
      <label className="setting">
        Speech captions above the pet
        <input
          type="checkbox"
          checked={p.petCaptions}
          onChange={(e) => updatePreferences({ petCaptions: e.target.checked })}
        />
      </label>
      <label className="setting">
        Companion size · {Math.round(p.petScale * 100)}%
        <input
          type="number"
          min="25"
          step="5"
          aria-label="Companion size"
          value={Math.round(p.petScale * 100)}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n >= 25 && Number.isFinite(n))
              updatePreferences({ petScale: n / 100 });
          }}
        />
      </label>
      <p className="hint">
        Drag an edge or scroll to resize. The character's frame can extend
        beyond a monitor. The dock stays on the visible screen. Ctrl+Alt+0
        restores the normal size and brings her back.
      </p>
      <button
        onClick={() => {
          updatePreferences({
            petScale: 1,
            petMode: "stand",
            petAvoiding: false,
            clickThrough: false,
          });
          if (isNative)
            void import("@tauri-apps/api/core").then(({ invoke }) =>
              invoke("recover_pet", { center: true }),
            );
        }}
      >
        Reset size & find pet
      </button>
      <label className="setting">
        Always on top
        <input
          type="checkbox"
          checked={p.petAlwaysOnTop}
          disabled={!isNative}
          onChange={(e) =>
            updatePreferences({ petAlwaysOnTop: e.target.checked })
          }
        />
      </label>
      {isNative && (
        <label className="setting">
          Display
          <select
            aria-label="Pet display"
            value={p.monitor}
            onChange={(e) => updatePreferences({ monitor: e.target.value })}
          >
            <option value="current">Follow me · current monitor</option>

            {monitors.map((m) => (
              <option key={m} value={m}>
                {m.split(":")[0]}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
