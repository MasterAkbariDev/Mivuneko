import { CompanionControls } from "./CompanionControls";
import { isNative } from "./broker";
import { usePreferences, updatePreferences } from "./preferences";
import { characters } from "./lunaModel";
import { useVoice } from "./useVoice";
import { useState } from "react";
import { SpeechSettings } from "./SpeechSettings";
import { CharacterVoice } from "./CharacterVoice";
export function PetSettings() {
  const p = usePreferences();
  const [voiceError, setVoiceError] = useState("");
  const preview = useVoice(
    () => {},
    () => {},
    setVoiceError,
  );
  return (
    <div className="pet-settings">
      <h3 className="settings-heading">Companion</h3>
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
          {Object.entries(characters).map(([id, character]) => (
            <option key={id} value={id}>
              {character.name}
            </option>
          ))}
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
      <h3 className="settings-heading">Voice</h3>
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
          <option value="open-mic">Open mic + replies</option>
          <option value="spoken">
            {isNative ? "Spoken replies" : "Spoken replies · preview"}
          </option>
        </select>
      </label>
      <p className="hint">
        {isNative
          ? "Open mic starts only when you press Start open mic in Conversations. Recognition runs locally. Choose a speech engine below for spoken replies."
          : "Voice is a preview in the browser; no microphone is opened or audio generated."}{" "}
      </p>
      <SpeechSettings />
      <h3 className="settings-heading">Voice output</h3>
      <CharacterVoice
        character={p.character}
        preview={preview}
        volume={p.volume}
      />
      {voiceError && (
        <p className="error" role="alert">
          {voiceError}
        </p>
      )}
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
