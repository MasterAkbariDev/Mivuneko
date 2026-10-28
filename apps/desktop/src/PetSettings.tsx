import { CompanionControls } from "./CompanionControls";
import { isNative } from "./broker";
import { usePreferences, updatePreferences } from "./preferences";
export function PetSettings() {
  const p = usePreferences();
  return (
    <div className="pet-settings">
      <CompanionControls />
      <label className="setting">
        Character
        <select
          aria-label="Character"
          value={p.character}
          onChange={(e) =>
            updatePreferences({
              character: e.target.value as typeof p.character,
            })
          }
        >
          <option value="luna">Luna · 2D illustrated model</option>
          <option value="sample-vrm">Pixiv · expressive VRM sample</option>
          <option value="chibi">Luna · 3D prototype</option>
          <option value="mock-cat">Mooncat · 2D prototype</option>
          <option value="local-vrm">Import your VRM</option>
        </select>
      </label>
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
        Voice
        <select
          aria-label="Voice mode"
          value={p.voice}
          onChange={(e) =>
            updatePreferences({ voice: e.target.value as typeof p.voice })
          }
        >
          <option value="off">Text only</option>
          <option value="push-to-talk">
            {isNative ? "Push to talk + replies" : "Push to talk · preview"}
          </option>
          <option value="spoken">
            {isNative ? "Spoken replies" : "Spoken replies · preview"}
          </option>
        </select>
      </label>
      <p className="hint">
        {isNative
          ? "Use the microphone in inline Chat or Conversations. Gemini voice works across platforms; local voice uses whisper.cpp and macOS speech."
          : "Voice is a preview in the browser; no microphone is opened or audio generated."}{" "}
        Imported VRM motion clips are not yet connected.
      </p>
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
        Speech volume
        <input
          aria-label="Speech volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={p.volume}
          onChange={(e) =>
            updatePreferences({ volume: Number(e.target.value) })
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
      <label className="setting">
        Reduce motion
        <input
          type="checkbox"
          checked={p.reduced}
          onChange={(e) => updatePreferences({ reduced: e.target.checked })}
        />
      </label>
    </div>
  );
}
