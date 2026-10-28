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
  | "error";
export interface AppInfo {
  location?: string;
  id: string;
  name: string;
}
export interface LaunchRequest {
  id: string;
  app: AppInfo;
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
  mood?: Mood;
  text: string;
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
