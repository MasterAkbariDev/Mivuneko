import { useEffect, useState } from "react";
import { isNative } from "./broker";
import { characters } from "./lunaModel";
import type { Mood } from "../../../packages/shared-schemas/index.ts";
import { updatePreferences, usePreferences } from "./preferences";
import { startSpeechDownload, useSpeechDownload } from "./speechDownloads";

const SAMPLES: [Mood, string, string][] = [
  [
    "idle",
    "Neutral",
    "Hi, it's really nice to see you. What should we do today?",
  ],
  [
    "happy",
    "Happy",
    "Yay, that worked! I'm so happy we figured it out together.",
  ],
  [
    "celebrating",
    "Celebrating",
    "We did it! That was amazing, I can't believe it!",
  ],
  ["surprised", "Surprised", "Oh! Wait, really? I did not expect that at all."],
  ["curious", "Curious", "Hmm, that's interesting. How did you find it?"],
  [
    "confused",
    "Confused",
    "Um... I'm not sure I understand. Could you say that again?",
  ],
  [
    "concerned",
    "Concerned",
    "Oh no, are you okay? Take your time, I'm right here.",
  ],
  ["sad", "Sad", "Oh... I'm sorry about that. That sounds really hard."],
  ["angry", "Annoyed", "Hey, that's not okay. I really didn't like that."],
];
interface Preview {
  speaking: boolean;
  preparing?: boolean;
  prepare: () => void;
  speak: (text: string, volume: number, emotion?: Mood) => Promise<void>;
  stop: () => Promise<void>;
}
// Read-only: each character's voice comes from its voice pack (docs/VOICE.md), not
// from a setting. The buttons audition every mood.
export function CharacterVoice({
  character,
  preview,
  volume,
}: {
  character: string;
  preview: Preview;
  volume: number;
}) {
  const preferences = usePreferences();
  const [own, setOwn] = useState<boolean | null>(null);
  const [systemSpeech, setSystemSpeech] = useState(false);
  const download = useSpeechDownload();
  const [installError, setInstallError] = useState("");
  async function installVoice() {
    setInstallError("");
    try {
      await startSpeechDownload("kokoro:v1");
      const { invoke } = await import("@tauri-apps/api/core");
      setOwn(!!(await invoke("character_voice", { character })));
    } catch (error) {
      setInstallError(String(error));
    }
  }
  useEffect(() => {
    if (isNative)
      void import("@tauri-apps/api/core")
        .then(({ invoke }) =>
          invoke<{ systemSpeech: boolean }>("voice_capabilities"),
        )
        .then((result) => setSystemSpeech(result?.systemSpeech === true))
        .catch(() => {});
  }, []);
  useEffect(() => {
    if (!isNative) return;
    setOwn(null);
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<unknown>("character_voice", { character }))
      .then((pack) => setOwn(!!pack))
      .catch(() => setOwn(false));
  }, [character]);
  const name =
    preferences.renderer === "sample-vrm"
      ? "Haru"
      : (characters[character as keyof typeof characters]?.name ?? character);
  return (
    <section className="settings-group" aria-label="Character voice">
      <label className="setting">
        Speech engine
        <select
          aria-label="Speech engine"
          value={preferences.voiceProvider}
          onChange={(e) =>
            updatePreferences({
              voiceProvider: e.target.value as typeof preferences.voiceProvider,
            })
          }
        >
          <option value="local">Local character voice · Kokoro</option>
          <option value="gemini">Expressive character voice · Gemini</option>
          {(systemSpeech || preferences.voiceProvider === "system") && (
            <option value="system" disabled={!systemSpeech}>
              System voice{!systemSpeech ? " · unavailable on this device" : ""}
            </option>
          )}
        </select>
      </label>
      <p className="hint">
        Voice:{" "}
        <b>
          {preferences.voiceProvider === "gemini"
            ? `${name} · expressive cloud voice`
            : preferences.voiceProvider === "system"
              ? "System voice"
              : own === null
                ? "checking…"
                : own
                  ? `${name}'s own voice`
                  : `character voice not installed`}
        </b>
        .{" "}
        {preferences.voiceProvider === "gemini"
          ? "Expressive speech streams as it is generated. Reply text is sent to Gemini using your connection settings."
          : preferences.voiceProvider === "system"
            ? "Uses the voice service built into your device. Availability depends on your system."
            : "Runs on your device when the character voice engine is installed. Choose Gemini for expressive streaming speech."}
      </p>
      {preferences.voiceProvider === "local" && own === false && (
        <div className="setup-callout">
          <strong>Install your companion’s speaking voice</strong>
          <p>
            Parakeet listens to you. Kokoro makes your companion speak. Download
            the voice engine and model once to use it offline.
          </p>
          <button
            type="button"
            disabled={!isNative || !!download?.active}
            onClick={() => void installVoice()}
          >
            {download?.active && download.engine === "kokoro:v1"
              ? "Installing local voice…"
              : "Install local voice · 360 MB"}
          </button>
        </div>
      )}
      {installError && (
        <p role="alert" className="error">
          {installError}
        </p>
      )}
      <div className="mood-previews">
        {SAMPLES.map(([mood, label, line]) => (
          <button
            key={mood}
            type="button"
            disabled={
              !isNative ||
              preview.speaking ||
              preview.preparing ||
              (preferences.voiceProvider === "local" && own !== true)
            }
            onClick={() => {
              preview.prepare();
              void preview.speak(line, volume, mood);
            }}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          disabled={!preview.speaking && !preview.preparing}
          onClick={() => void preview.stop()}
        >
          Stop
        </button>
      </div>
    </section>
  );
}
