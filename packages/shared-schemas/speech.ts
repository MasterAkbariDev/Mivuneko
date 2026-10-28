import type { AgentReply } from "./index.ts";
const CODE_NOTE = "I put the code in the chat.";
const MAX_CHARS = 240;
// What Luna should say aloud for a reply: the model's short `speech` when given,
// otherwise the text with code, links and Markdown symbols stripped and shortened.
export function speakable(reply: Pick<AgentReply, "text" | "speech">): string {
  const given = reply.speech?.replace(/\s+/g, " ").trim();
  if (given) return given.slice(0, 300);
  let text = reply.text;
  const hadCode = /```|~~~/.test(text);
  text = text
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/~~~[\s\S]*?(~~~|$)/g, " ")
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, "$1")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "the link")
    .replace(/`([^`\n]{1,24})`/g, "$1")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>+\s?/gm, "")
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*[-*_]{3,}\s*$/gm, " ")
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, " ")
    .replace(/\|/g, ", ")
    .replace(/[*_~#>]+/g, "");
  // Line breaks become sentence breaks so lists and paragraphs get a natural pause.
  text = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (/[.!?…:;]$/.test(line) ? line : `${line}.`))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = text
    .split(/(?<=[.!?…])\s+/)
    .filter((s) => /\p{L}|\p{N}/u.test(s));
  let out = "";
  for (const sentence of sentences.slice(0, 2)) {
    if (out && (out + " " + sentence).length > MAX_CHARS) break;
    out = out ? `${out} ${sentence}` : sentence;
  }
  out = out.slice(0, MAX_CHARS).trim();
  if (hadCode) out = out ? `${out} ${CODE_NOTE}` : CODE_NOTE;
  return out;
}
