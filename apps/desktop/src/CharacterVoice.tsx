import { useEffect, useState } from "react";
import { isNative } from "./broker";
import { characters } from "./lunaModel";
import type { Mood } from "../../../packages/shared-schemas/index.ts";

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
  const [own, setOwn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isNative) return;
    setOwn(null);
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<unknown>("character_voice", { character }))
      .then((pack) => setOwn(!!pack))
      .catch(() => setOwn(false));
  }, [character]);
  const name =
    characters[character as keyof typeof characters]?.name ?? character;
  return (
    <section className="settings-group" aria-label="Character voice">
      <p className="hint">
        Voice:{" "}
        <b>
          {own === null
            ? "checking…"
            : own
              ? `${name}'s own voice`
              : `system voice (${name} has no voice pack yet)`}
        </b>
        . Each character's voice is fixed by its voice pack, so it stays the
        same character every time. To change it, see docs/VOICE.md.
      </p>
      <div className="mood-previews">
        {SAMPLES.map(([mood, label, line]) => (
          <button
            key={mood}
            type="button"
            disabled={!isNative || preview.speaking}
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
          disabled={!preview.speaking}
          onClick={() => void preview.stop()}
        >
          Stop
        </button>
      </div>
    </section>
  );
}
