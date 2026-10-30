export type Mode = "Chat" | "Assist" | "Creative" | "Autonomous";
export type Mood =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "angry"
  | "sad"
  | "surprised"
  | "happy"
  | "curious"
  | "confused"
  | "concerned"
  | "celebrating"
  | "sleeping"
  | "crying"
  | "shy"
  | "love"
  | "excited"
  | "teasing"
  | "joking"
  | "wink"
  | "proud"
  | "determined"
  | "error";
export interface AppInfo {
  location?: string;
  id: string;
  name: string;
}
export type ApprovalMode = "ask" | "auto" | "deny";
export interface LaunchRequest {
  /** One-time approval token issued by the native broker. */
  id: string;
  app: AppInfo;
  /** The native policy that decides this request (absent in browser preview). */
  policy?: ApprovalMode;
}
export interface LaunchPolicy {
  enabled: boolean;
  mode: ApprovalMode;
}
export interface LaunchResult {
  ok: boolean;
  message: string;
}
export interface Broker {
  listApps(): Promise<AppInfo[]>;
  requestLaunch(appId: string): Promise<LaunchRequest>;
  resolveLaunch(requestId: string, allow: boolean): Promise<LaunchResult>;
  revoke(): Promise<void>;
}
export interface AgentReply {
  companionActions?: import("./companion-actions.ts").CompanionAction[];
  mood?: Mood;
  text: string;
  // Short, plain sentence(s) to speak aloud instead of the formatted text.
  speech?: string;
  appQuery?: string;
}
export interface Agent {
  reply(
    text: string,
    mode: Mode,
    signal: AbortSignal,
    history?: { role: string; text: string }[],
    onProgress?: (text: string) => void,
  ): Promise<AgentReply>;
}
export interface Speech {
  transcribe(signal: AbortSignal): Promise<string>;
  speak(text: string, signal: AbortSignal): Promise<void>;
}
