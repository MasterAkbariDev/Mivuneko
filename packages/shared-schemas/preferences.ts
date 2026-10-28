export type PetMode =
  | "auto"
  | "cozy"
  | "playful"
  | "focus"
  | "sleep"
  | "dance"
  | "walk"
  | "run"
  | "sit";
export type PetExpression =
  | "auto"
  | "idle"
  | "happy"
  | "surprised"
  | "angry"
  | "sleeping"
  | "speaking"
  | "thinking"
  | "listening"
  | "shy"
  | "sad"
  | "celebrating"
  | "dancing"
  | "excited"
  | "confused"
  | "love"
  | "joking"
  | "teasing"
  | "wink"
  | "proud"
  | "crying"
  | "determined";
export type CharacterId =
  | "luna"
  | "miku"
  | "kitsune"
  | "stella"
  | "teto"
  | "neru"
  | "snow"
  | "silver"
  | "azure"
  | "goth";
export type LocalVoiceStyle = "natural" | "bright" | "multilingual";
export type LocalVoiceLanguage = "en" | "ja" | "fr" | "es" | "de";
export interface Preferences {
  version: 1;
  petMode: PetMode;
  petExpression: PetExpression;
  petEffects: boolean;
  petCaptions: boolean;
  petScale: number;
  petAlwaysOnTop: boolean;
  backend: "offline" | "hermes" | "auto" | "gemini" | "groq";
  voiceProvider: "local" | "gemini";
  localVoiceStyle: LocalVoiceStyle;
  localVoiceLanguage: LocalVoiceLanguage;
  appLaunching: boolean;
  approvalMode: "ask" | "auto" | "deny";
  rememberHistory: boolean;
  character: CharacterId;
  movement: "stationary" | "roaming";
  proactive: boolean;
  spokenCheckins: boolean;
  proactiveInterval: number;
  dailyLimit: number;
  quietStart: number;
  quietEnd: number;
  focus: boolean;
  clickThrough: boolean;
  voice: "off" | "push-to-talk" | "spoken" | "open-mic";
  reduced: boolean;
  monitor: string;
  volume: number;
}
export const defaults: Preferences = {
  version: 1,
  petMode: "auto",
  petExpression: "auto",
  petEffects: true,
  petCaptions: true,
  petScale: 1,
  petAlwaysOnTop: true,
  backend: "offline",
  voiceProvider: "local",
  localVoiceStyle: "natural",
  localVoiceLanguage: "en",
  appLaunching: true,
  approvalMode: "ask",
  rememberHistory: false,
  character: "luna",
  movement: "stationary",
  proactive: false,
  spokenCheckins: false,
  proactiveInterval: 30,
  dailyLimit: 2,
  quietStart: 22,
  quietEnd: 8,
  focus: false,
  clickThrough: false,
  voice: "off",
  reduced: false,
  monitor: "current",
  volume: 0.7,
};
export function parsePreferences(raw: unknown): Preferences {
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<Preferences>;
  return {
    ...defaults,
    petMode: [
      "auto",
      "cozy",
      "playful",
      "focus",
      "sleep",
      "dance",
      "walk",
      "run",
      "sit",
    ].includes(p.petMode ?? "")
      ? p.petMode!
      : "auto",
    petExpression: [
      "auto",
      "idle",
      "happy",
      "surprised",
      "angry",
      "sleeping",
      "speaking",
      "thinking",
      "listening",
      "shy",
      "sad",
      "celebrating",
      "dancing",
      "excited",
      "confused",
      "love",
      "joking",
      "teasing",
      "wink",
      "proud",
      "crying",
      "determined",
    ].includes(p.petExpression ?? "")
      ? p.petExpression!
      : "auto",
    petEffects: p.petEffects !== false,
    petCaptions: p.petCaptions !== false,
    petScale:
      typeof p.petScale === "number" && Number.isFinite(p.petScale)
        ? Math.max(0.5, Math.min(1.8, p.petScale))
        : 1,
    petAlwaysOnTop: p.petAlwaysOnTop !== false,
    backend:
      p.backend === "gemini" || p.backend === "groq" || p.backend === "auto"
        ? "auto"
        : p.backend === "hermes"
          ? "hermes"
          : "offline",
    voiceProvider: p.voiceProvider === "gemini" ? "gemini" : "local",
    localVoiceStyle:
      p.localVoiceStyle === "bright" || p.localVoiceStyle === "multilingual"
        ? p.localVoiceStyle
        : "natural",
    localVoiceLanguage: ["en", "ja", "fr", "es", "de"].includes(
      p.localVoiceLanguage ?? "",
    )
      ? p.localVoiceLanguage!
      : "en",
    appLaunching: p.appLaunching !== false,
    approvalMode:
      p.approvalMode === "auto" || p.approvalMode === "deny"
        ? p.approvalMode
        : "ask",
    rememberHistory: p.rememberHistory === true,
    character:
      p.character === "miku" ||
      p.character === "kitsune" ||
      p.character === "stella" ||
      p.character === "teto" ||
      p.character === "neru" ||
      p.character === "snow" ||
      p.character === "silver" ||
      p.character === "azure" ||
      p.character === "goth"
        ? p.character
        : "luna",
    movement: p.movement === "roaming" ? "roaming" : "stationary",
    proactive: p.proactive === true,
    spokenCheckins: p.spokenCheckins === true,
    proactiveInterval: Number.isInteger(p.proactiveInterval)
      ? Math.max(5, Math.min(240, p.proactiveInterval!))
      : 30,
    dailyLimit: Number.isInteger(p.dailyLimit)
      ? Math.max(0, Math.min(8, p.dailyLimit!))
      : 2,
    quietStart: Number.isInteger(p.quietStart)
      ? Math.max(0, Math.min(23, p.quietStart!))
      : 22,
    quietEnd: Number.isInteger(p.quietEnd)
      ? Math.max(0, Math.min(23, p.quietEnd!))
      : 8,
    focus: p.focus === true,
    clickThrough: p.clickThrough === true,
    voice:
      p.voice === "push-to-talk" ||
      p.voice === "spoken" ||
      p.voice === "open-mic"
        ? p.voice
        : "off",
    reduced: p.reduced === true,
    monitor:
      typeof p.monitor === "string" && p.monitor.length < 200
        ? p.monitor
        : "current",
    volume:
      typeof p.volume === "number" && Number.isFinite(p.volume)
        ? Math.max(0, Math.min(1, p.volume))
        : 0.7,
  };
}
