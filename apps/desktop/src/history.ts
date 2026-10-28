import { isNative } from "./broker";
import {
  parseHistory,
  type ChatMessage,
} from "../../../packages/shared-schemas/history.ts";
export async function loadHistory(): Promise<ChatMessage[]> {
  if (isNative) {
    const { invoke } = await import("@tauri-apps/api/core");
    return parseHistory(JSON.parse(await invoke<string>("load_history")));
  }
  try {
    return parseHistory(
      JSON.parse(localStorage.getItem("mivuneko.history.v1") ?? "null"),
    );
  } catch {
    return [];
  }
}
export async function saveHistory(messages: ChatMessage[]) {
  const json = JSON.stringify(parseHistory(messages));
  if (isNative) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_history", { json, consent: true });
  } else localStorage.setItem("mivuneko.history.v1", json);
}
export async function clearHistory() {
  if (isNative) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("clear_history");
  }
  localStorage.removeItem("mivuneko.history.v1");
}
