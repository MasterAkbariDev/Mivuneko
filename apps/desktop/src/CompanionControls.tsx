import { RangeSlider } from "./RangeSlider";
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
        The desktop shows only your companion and optional captions.
        Double-click the character for Conversations, or right-click for
        Characters.
      </p>
      <label className="setting">
        Companion mode
        <select
          aria-label="Pet mode"
          value={p.petMode}
          onChange={(e) =>
            updatePreferences({
              petMode: e.target.value as typeof p.petMode,
              petExpression: "auto",
            })
          }
        >
          <option value="auto">Automatic · follows the conversation</option>
          <option value="cozy">Cozy · gentle and bashful</option>
          <option value="playful">Playful · bright and cheerful</option>
          <option value="focus">Focus · quiet company</option>
          <option value="sleep">Sleep · curled up</option>
          <option value="dance">Dance · little celebration</option>
          <option value="walk">Walk · roam slowly</option>
          <option value="run">Run · roam faster</option>
          <option value="sit">Sit · settle in place</option>
        </select>
      </label>
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
        <RangeSlider
          aria-label="Companion size"

          min="0.5"
          max="1.8"
          step="0.05"
          value={p.petScale}
          onChange={(e) =>
            updatePreferences({ petScale: Number(e.target.value) })
          }
        />
      </label>
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
            <option value="current">Current monitor</option>
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
