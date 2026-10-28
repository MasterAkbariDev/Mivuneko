import { CompanionControls } from "./CompanionControls";
import { isNative } from "./broker";
import { usePreferences, updatePreferences } from "./preferences";
export function PetSettings() {
  const p = usePreferences();
  return (
    <div className="pet-settings">
      <h3 className="settings-heading">Companion</h3>
      <CompanionControls />
      <label className="setting">
        Movement
        <select
          aria-label="Movement"
          value={p.movement}
          onChange={(e) =>
            updatePreferences({ movement: e.target.value as typeof p.movement })
          }
        >
          <option value="stationary">Stationary</option>
          <option value="roaming">Roam screen edge</option>
        </select>
      </label>
      <label className="setting">
        Occasional check-ins
        <input
          type="checkbox"
          checked={p.proactive}
          onChange={(e) => updatePreferences({ proactive: e.target.checked })}
        />
      </label>
      <p className="hint">
        Opt-in check-ins, no screen or system-idle monitoring. Ignored check-ins
        stay quiet until you interact.
      </p>
      <label className="setting">
        Speak occasional check-ins
        <input
          type="checkbox"
          checked={p.spokenCheckins}
          onChange={(e) =>
            updatePreferences({ spokenCheckins: e.target.checked })
          }
        />
      </label>
      <p className="hint">
        Separate opt-in. Requires a voice mode and configured provider. Quiet
        hours, daily limit and do not disturb still apply.
      </p>
      <label className="setting">
        Check-in interval (minutes)
        <input
          aria-label="Check-in interval"
          type="number"
          min="5"
          max="240"
          value={p.proactiveInterval}
          onChange={(e) =>
            updatePreferences({ proactiveInterval: Number(e.target.value) })
          }
        />
      </label>
      <label className="setting">
        Daily check-in limit
        <input
          aria-label="Daily check-in limit"
          type="number"
          min="0"
          max="8"
          value={p.dailyLimit}
          onChange={(e) =>
            updatePreferences({ dailyLimit: Number(e.target.value) })
          }
        />
      </label>
      <label className="setting">
        Quiet hours start
        <input
          aria-label="Quiet hours start"
          type="number"
          min="0"
          max="23"
          value={p.quietStart}
          onChange={(e) =>
            updatePreferences({ quietStart: Number(e.target.value) })
          }
        />
      </label>
      <label className="setting">
        Quiet hours end
        <input
          aria-label="Quiet hours end"
          type="number"
          min="0"
          max="23"
          value={p.quietEnd}
          onChange={(e) =>
            updatePreferences({ quietEnd: Number(e.target.value) })
          }
        />
      </label>
      <label className="setting">
        Do not disturb
        <input
          type="checkbox"
          checked={p.focus}
          onChange={(e) => updatePreferences({ focus: e.target.checked })}
        />
      </label>
      <label className="setting">
        Pet click-through
        <input
          type="checkbox"
          disabled={!isNative}
          checked={p.clickThrough}
          onChange={(e) =>
            updatePreferences({ clickThrough: e.target.checked })
          }
        />
      </label>
      <p className="hint">
        When enabled, the pet ignores clicks. Recover using menu bar → Show pet,
        or turn this off in Chat → Settings.
      </p>
    </div>
  );
}
