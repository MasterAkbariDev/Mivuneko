import { RangeSlider } from "./RangeSlider";
import { useState } from "react";
import { BackendSettings } from "./BackendSettings";
import { SpeechSettings } from "./SpeechSettings";
import { CharacterVoice } from "./CharacterVoice";
import { ShortcutSettings } from "./ShortcutSettings";
import { usePreferences, updatePreferences } from "./preferences";
import { useVoice } from "./useVoice";
let activeCategory = "Voice & input";
export function SettingsHome() {
  const [tab, setTab] = useState(activeCategory);
  const [error, setError] = useState("");
  const p = usePreferences();
  const preview = useVoice(
    () => {},
    () => {},
    setError,
  );
  return (
    <div className="settings-home">
      <nav className="settings-tabs" aria-label="Settings category">
        {["Voice & input", "Connections", "Shortcuts", "Appearance"].map(
          (name) => (
            <button
              type="button"
              key={name}
              aria-pressed={tab === name}
              onClick={() => {
                void preview.stop();
                activeCategory = name;
                setTab(name);
              }}
            >
              {name}
            </button>
          ),
        )}
      </nav>
      <div className="settings-content">
        {tab === "Voice & input" ? (
          <>
            <section className="settings-group">
              <span className="eyebrow">CONVERSATION</span>
              <h3>A conversation that feels natural</h3>
              <label className="setting">
                Voice mode
                <select
                  aria-label="Voice mode"
                  value={p.voice}
                  onChange={(e) =>
                    updatePreferences({
                      voice: e.target.value as typeof p.voice,
                    })
                  }
                >
                  <option value="off">Text only</option>
                  <option value="spoken">Spoken replies</option>
                  <option value="push-to-talk">Push to talk + replies</option>
                  <option value="open-mic">Open mic + replies</option>
                </select>
              </label>
              <label className="setting">
                Reply volume · {Math.round(p.volume * 100)}%
                <RangeSlider
                  aria-label="Reply volume"

                  min="0"
                  max="1"
                  step="0.05"
                  value={p.volume}
                  onChange={(e) =>
                    updatePreferences({ volume: Number(e.target.value) })
                  }
                />
              </label>
            </section>
            <CharacterVoice
              character={p.character}
              preview={preview}
              volume={p.volume}
            />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <SpeechSettings />
          </>
        ) : tab === "Connections" ? (
          <BackendSettings />
        ) : tab === "Shortcuts" ? (
          <ShortcutSettings />
        ) : (
          <section className="settings-group">
            <span className="eyebrow">YOUR WORKSPACE</span>
            <h3>Comfort in the details</h3>
            <label className="setting">
              Text size · {Math.round(p.textScale * 100)}%
              <RangeSlider
                aria-label="Text size"
                min="0.9"
                max="1.25"
                step="0.05"
                value={p.textScale}
                onChange={(e) =>
                  updatePreferences({ textScale: Number(e.target.value) })
                }
              />
            </label>
            <label className="setting">
              Reduce animation
              <input
                type="checkbox"
                checked={p.reduced}
                onChange={(e) =>
                  updatePreferences({ reduced: e.target.checked })
                }
              />
            </label>
            <label className="setting">
              Quiet focus mode
              <input
                type="checkbox"
                checked={p.focus}
                onChange={(e) => updatePreferences({ focus: e.target.checked })}
              />
            </label>
            <p className="hint">
              Appearance and accessibility preferences update across the app and
              your desktop companion.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
