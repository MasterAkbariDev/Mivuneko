import type { AgentReply, Mood } from "./index.ts";
export function parseAgentReply(raw: string): AgentReply {
  try {
    const json = JSON.parse(
      raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""),
    );
    const moods: Mood[] = [
      "idle",
      "angry",
      "sad",
      "surprised",
      "happy",
      "curious",
      "confused",
      "concerned",
      "celebrating",
      "crying",
      "shy",
      "love",
      "excited",
      "teasing",
      "joking",
      "wink",
      "proud",
      "determined",
    ];
    if (
      typeof json.text === "string" &&
      json.text.trim() &&
      json.text.length <= 8000
    )
      return {
        text: json.text,
        ...(typeof json.appQuery === "string" &&
        json.appQuery.trim() &&
        json.appQuery.length <= 200
          ? { appQuery: json.appQuery }
          : {}),
        ...(typeof json.speech === "string" &&
        json.speech.trim() &&
        json.speech.length <= 300
          ? { speech: json.speech.trim() }
          : {}),
        mood: moods.includes(json.emotion) ? json.emotion : "idle",
      };
  } catch {}
  return { text: raw, mood: "idle" };
}
export function boundedMessages(
  history: { role: string; text: string }[],
  text: string,
) {
  const all = [...history.slice(-30), { role: "user", text }];
  let budget = 40000;
  const messages: { role: string; content: string }[] = [];
  for (const item of all.reverse()) {
    if (item.role !== "user" && item.role !== "assistant") continue;
    const content = item.text.slice(0, 4000);
    if (content.length * 3 > budget) break;
    budget -= content.length * 3;
    messages.unshift({ role: item.role, content });
  }
  return messages;
}
