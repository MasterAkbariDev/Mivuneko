import type { Agent, Mode } from "../../packages/shared-schemas/index.ts";
export const mockHermes: Agent = {
  async reply(text: string, mode: Mode, signal: AbortSignal) {
    signal.throwIfAborted();
    const match = /^open\s+(.+?)\s*[.!]?$/i.exec(text.trim());
    if (match && mode !== "Chat" && mode !== "Creative")
      return {
        text: "I'll find that app. You decide whether to open it.",
        appQuery: match[1].trim(),
      };
    return {
      text: match
        ? "Switch to Assist to request app launching. Chat and Creative have no desktop tools."
        : "You’re using offline demo mode. Try “Open Telegram” in Assist mode, or choose Google Gemini or Local Hermes Agent in Settings for live chat.",
    };
  },
};
