export type PetMode =
  | "auto"
  | "stand"
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
  | "goth"
  | "mochi";
export type LocalVoiceStyle = "natural" | "bright" | "multilingual";
export type LocalVoiceLanguage = "en" | "ja" | "fr" | "es" | "de";
export interface Preferences {
  renderer: "2d" | "sample-vrm" | "custom-vrm";
  activePackId: string;
  activePackName: string;
  customPackPose: string;
  customModelId: string;
  customModelName: string;
  microphoneId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  textScale: number;
  shortcuts: Record<
    | "record"
    | "stop"
    | "chat"
    | "characters"
    | "settings"
    | "edit"
    | "clickThrough"
    | "focus"
    | "screen"
    | "reset",
    string
  >;
  version: 1;
  petMode: PetMode;
  petExpression: PetExpression;
  petEffects: boolean;
  illustrationDepth: boolean;
  petCaptions: boolean;
  petScale: number;
  companionName: string;
  micIndicator: boolean;
  petAlwaysOnTop: boolean;
  backend: "offline" | "hermes" | "auto" | "gemini-only" | "groq-only";
  voiceProvider: "local" | "gemini" | "system";
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
  petEdit: boolean;
  petAvoiding: boolean;
  voice: "off" | "push-to-talk" | "spoken" | "open-mic";
  // Speech recognition: engine id from the native registry ("auto" = configured model).
  sttEngine: string;
  micSensitivity: "low" | "normal" | "high";
  endPauseMs: number;
  turnTaking: "automatic" | "manual";
  turnTakingVersion: 2;
  bargeIn: boolean;
  /** Gemini/Groq reply format: tagged plain text (Slice 1) or the legacy JSON object. */
  replyFormat: "tagged" | "json";
  /** Speak each sentence as soon as it streams in, instead of after the full reply. */
  earlySpeech: boolean;
  sttContext: boolean;
  reduced: boolean;
  monitor: string;
  volume: number;
}
export const defaults: Preferences = {
  renderer: "2d",
  activePackId: "",
  activePackName: "",
  customPackPose: "",
  customModelId: "",
  customModelName: "",
  microphoneId: "default",
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  textScale: 1,
  shortcuts: {
    record: "Alt+M",
    stop: "Ctrl+Alt+.",
    chat: "Alt+1",
    characters: "Alt+2",
    settings: "Alt+,",
    edit: "Ctrl+Alt+E",
    clickThrough: "Ctrl+Alt+X",
    focus: "Ctrl+Alt+F",
    screen: "Ctrl+Alt+S",
    reset: "Ctrl+Alt+0",
  },
  version: 1,
  petMode: "auto",
  petExpression: "auto",
  petEffects: true,
  illustrationDepth: false,
  petCaptions: true,
  petScale: 1,
  companionName: "",
  micIndicator: true,
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
  petEdit: false,
  petAvoiding: false,
  voice: "off",
  sttEngine: "auto",
  micSensitivity: "normal",
  endPauseMs: 3500,
  turnTaking: "automatic",
  turnTakingVersion: 2,
  bargeIn: true,
  replyFormat: "tagged",
  earlySpeech: true,
  sttContext: true,
  reduced: false,
  monitor: "current",
  volume: 0.7,
};
export function parsePreferences(raw: unknown): Preferences {
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<Preferences>;
  return {
    ...defaults,
    activePackId:
      typeof p.activePackId === "string" ? p.activePackId.slice(0, 80) : "",
    activePackName:
      typeof p.activePackName === "string" ? p.activePackName.slice(0, 80) : "",
    customPackPose:
      typeof p.customPackPose === "string" ? p.customPackPose.slice(0, 80) : "",
    customModelId:
      typeof p.customModelId === "string" ? p.customModelId.slice(0, 80) : "",
    customModelName:
      typeof p.customModelName === "string"
        ? p.customModelName.slice(0, 80)
        : "",
    renderer:
      p.renderer === "sample-vrm" || p.renderer === "custom-vrm"
        ? p.renderer
        : "2d",
    microphoneId:
      typeof p.microphoneId === "string" && p.microphoneId.length < 300
        ? p.microphoneId
        : "default",
    echoCancellation: p.echoCancellation !== false,
    noiseSuppression: p.noiseSuppression !== false,
    autoGainControl: p.autoGainControl !== false,
    textScale:
      typeof p.textScale === "number" && Number.isFinite(p.textScale)
        ? Math.max(0.9, Math.min(1.25, p.textScale))
        : 1,
    shortcuts: Object.fromEntries(
      Object.entries(defaults.shortcuts).map(([action, fallback]) => {
        const value = p.shortcuts?.[action as keyof Preferences["shortcuts"]];
        return [
          action,
          typeof value === "string" &&
          value !== "Escape" &&
          /^(?:(?:Ctrl|Alt|Shift|Meta)\+){0,4}(?:[A-Za-z0-9,./;]|Escape|F\d{1,2})$/.test(
            value,
          )
            ? value
            : fallback,
        ];
      }),
    ) as Preferences["shortcuts"],
    petMode: [
      "auto",
      "stand",
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
      "stand",
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
    illustrationDepth: p.illustrationDepth === true,
    petCaptions: p.petCaptions !== false,
    companionName:
      typeof p.companionName === "string"
        ? p.companionName.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 40)
        : "",
    micIndicator: p.micIndicator !== false,
    petScale:
      typeof p.petScale === "number" && Number.isFinite(p.petScale)
        ? Math.max(0.25, p.petScale)
        : 1,
    petAlwaysOnTop: p.petAlwaysOnTop !== false,
    // Legacy "gemini"/"groq" values migrate to auto; the "-only" values pin one provider.
    backend:
      p.backend === "gemini-only" || p.backend === "groq-only"
        ? p.backend
        : ["gemini", "groq", "auto"].includes(p.backend as string)
          ? "auto"
          : p.backend === "hermes"
            ? "hermes"
            : "offline",
    voiceProvider:
      p.voiceProvider === "gemini" || p.voiceProvider === "system"
        ? p.voiceProvider
        : "local",
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
      p.character === "goth" ||
      p.character === "mochi"
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
    petEdit: p.petEdit === true,
    petAvoiding: p.petAvoiding === true,
    voice:
      p.voice === "push-to-talk" ||
      p.voice === "spoken" ||
      p.voice === "open-mic"
        ? p.voice
        : "off",
    sttEngine:
      typeof p.sttEngine === "string" &&
      /^(auto|(whisper|parakeet):[A-Za-z0-9._-]{1,40})$/.test(p.sttEngine)
        ? p.sttEngine
        : "auto",
    micSensitivity:
      p.micSensitivity === "low" || p.micSensitivity === "high"
        ? p.micSensitivity
        : "normal",
    endPauseMs:
      p.turnTakingVersion === 2 &&
      typeof p.endPauseMs === "number" &&
      Number.isFinite(p.endPauseMs)
        ? Math.max(1500, Math.min(10000, Math.round(p.endPauseMs / 250) * 250))
        : 3500,
    turnTaking: p.turnTaking === "manual" ? "manual" : "automatic",
    turnTakingVersion: 2,
    bargeIn: p.bargeIn !== false,
    replyFormat: p.replyFormat === "json" ? "json" : "tagged",
    earlySpeech: p.earlySpeech !== false,
    sttContext: p.sttContext !== false,
    reduced: p.reduced === true,
    monitor:
      p.monitor !== "all" &&
      typeof p.monitor === "string" &&
      p.monitor.length < 200
        ? p.monitor
        : "current",
    volume:
      typeof p.volume === "number" && Number.isFinite(p.volume)
        ? Math.max(0, Math.min(1, p.volume))
        : 0.7,
  };
}
