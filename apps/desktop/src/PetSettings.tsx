import { CompanionControls } from "./CompanionControls";
import { isNative } from "./broker";
import { usePreferences, updatePreferences } from "./preferences";
import { characters } from "./lunaModel";
import { useVoice } from "./useVoice";
import { useState } from "react";
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
          ? "Open mic starts only when you press Start open mic in Conversations. Audio is processed locally; it pauses during replies. Local speech uses macOS voices."
          : "Voice is a preview in the browser; no microphone is opened or audio generated."}{" "}
      </p>
      {p.voiceProvider === "local" && (
        <>
          <label className="setting">
            Character voice style
            <select
              aria-label="Local voice style"
              value={p.localVoiceStyle}
              onChange={(e) =>
                updatePreferences({
                  localVoiceStyle: e.target.value as typeof p.localVoiceStyle,
                })
              }
            >
              <option value="natural">Natural · gentle English</option>
              <option value="bright">Bright · lively English</option>
              <option value="multilingual">
                Multilingual · choose language
              </option>
            </select>
          </label>
          {p.localVoiceStyle === "multilingual" && (
            <label className="setting">
              Speech language
              <select
                aria-label="Speech language"
                value={p.localVoiceLanguage}
                onChange={(e) =>
                  updatePreferences({
                    localVoiceLanguage: e.target
                      .value as typeof p.localVoiceLanguage,
                  })
                }
              >
                <option value="en">English</option>
                <option value="ja">Japanese</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
                <option value="de">German</option>
              </select>
            </label>
          )}
          <p className="hint">
            Each character has its own macOS voice. Language selection changes
            the voice; it does not translate text. Gemini voice is configured
            separately.
          </p>
        </>
      )}
      <button
        type="button"
        disabled={!isNative || preview.speaking}
        onClick={() => {
          setVoiceError("");
          preview.prepare();
          void preview.speak(
            p.localVoiceStyle === "multilingual"
              ? {
                  en: "Hello! It is lovely to meet you.",
                  ja: "こんにちは。お会いできて嬉しいです。",
                  fr: "Bonjour, je suis ravie de vous rencontrer.",
                  es: "Hola, encantada de conocerte.",
                  de: "Hallo, schön, dich kennenzulernen.",
                }[p.localVoiceLanguage]
              : "Hello! It is lovely to meet you.",
            p.volume,
          );
        }}
      >
        Preview voice
      </button>
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
