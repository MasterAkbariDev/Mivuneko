import type { Preferences } from "./preferences";
export interface VoiceIdentity {
  speaker: string;
  instruction: string;
  pronunciations: string;
}
const defaults: Record<string, VoiceIdentity> = {
  haru: {
    speaker: "Vivian",
    instruction:
      "A clear, warm young adult female companion. Gentle and bright, with precise English pronunciation and a natural conversational rhythm.",
    pronunciations: "Haru=ha roo",
  },
  luna: {
    speaker: "Serena",
    instruction:
      "A soft, calm female companion with a rounded warm tone, a relaxed pace and clear articulation.",
    pronunciations: "Luna=loo na",
  },
  mochi: {
    speaker: "Ono_Anna",
    instruction:
      "A small cheerful bunny companion. Light, playful and sweet, with clear English words and a gentle smile. Avoid squeaking.",
    pronunciations: "Mochi=mo chee",
  },
  miku: {
    speaker: "Ono_Anna",
    instruction:
      "A bright, musical female companion with crisp lively phrasing and careful English pronunciation.",
    pronunciations: "Miku=mee koo",
  },
  kitsune: {
    speaker: "Vivian",
    instruction:
      "A mischievous fox companion. Warm, confident and lightly playful, with a smooth clear voice.",
    pronunciations: "Kiko=kee ko",
  },
  stella: {
    speaker: "Serena",
    instruction:
      "An optimistic stargazing companion. Airy, expressive and thoughtful, with clear words and gentle rising intonation.",
    pronunciations: "Stella=stel ah",
  },
  teto: {
    speaker: "Sohee",
    instruction:
      "An energetic, friendly female companion. Confident and bouncy, with clear English articulation and light enthusiasm.",
    pronunciations: "Teto=teh toh",
  },
  neru: {
    speaker: "Vivian",
    instruction:
      "A direct, witty female companion. Dry playful delivery, clear words and a brisk natural rhythm.",
    pronunciations: "Neru=neh roo",
  },
  snow: {
    speaker: "Serena",
    instruction:
      "A quiet winter companion. Delicate, composed and soft spoken, while articulating every word clearly.",
    pronunciations: "Yuki=yoo kee",
  },
  silver: {
    speaker: "Sohee",
    instruction:
      "A poised female companion with a cool, smooth tone and measured clear English speech.",
    pronunciations: "Sora=soh rah",
  },
  azure: {
    speaker: "Vivian",
    instruction:
      "A curious, encouraging female companion. Open, bright and reassuring with clear gentle delivery.",
    pronunciations: "Aoi=ah oh ee",
  },
  goth: {
    speaker: "Serena",
    instruction:
      "A thoughtful gothic companion. Low, velvety and composed, with precise articulation and understated expression.",
    pronunciations: "Raven=ray ven",
  },
};
export function voiceKey(p: Preferences) {
  return p.activePackId
    ? `pack:${p.activePackId}`
    : p.renderer === "sample-vrm"
      ? "haru"
      : p.renderer === "custom-vrm"
        ? `vrm:${p.customModelId}`
        : p.character;
}
export function voiceIdentity(p: Preferences): VoiceIdentity {
  return (
    p.characterVoices[voiceKey(p)] ??
    defaults[voiceKey(p)] ?? {
      speaker: p.qwenSpeaker,
      instruction: p.qwenInstruction,
      pronunciations: "",
    }
  );
}
export function pronunciationEntries(text: string): [string, string][] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      const i = line.indexOf("=");
      return i > 0 && line.slice(i + 1).trim()
        ? [
            [line.slice(0, i).trim(), line.slice(i + 1).trim()] as [
              string,
              string,
            ],
          ]
        : [];
    })
    .slice(0, 40);
}
