export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}
export function parseHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is ChatMessage =>
        m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.text === "string" &&
        m.text.length <= 4000,
    )
    .slice(-32);
}
