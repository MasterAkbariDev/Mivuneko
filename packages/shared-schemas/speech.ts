import type { AgentReply } from "./index.ts";
// Narrate all prose in order. A provider's optional short summary must not replace it.
export function speakable(reply: Pick<AgentReply, "text" | "speech">): string {
  let text = reply.text || reply.speech || "";
  text = text.replace(
    /(?:here(?:'s| is)|see|the)\s+(?:(?:the|an?)\s+)?(?:code|example)(?:\s+(?:is\s+)?(?:below|above))?\s*[:.]/gi,
    "The code example is saved in our conversation.",
  );
  text = text
    .replace(
      /```[^\n]*\n[\s\S]*?(?:```|$)|~~~[^\n]*\n[\s\S]*?(?:~~~|$)/g,
      "\nA code example is available in our conversation.\n",
    )
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "the link")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>+\s?/gm, "")
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*[-*_]{3,}\s*$/gm, " ")
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, " ")
    .replace(/\|/g, ", ")
    .replace(/[*~#>]+/g, "");
  return text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/[.!?…:;]$/.test(s) ? s : `${s}.`))
    .join(" ")
    .replace(
      /(?:The code example is saved in our conversation\.\s*)?A code example is available in our conversation\./g,
      "A code example is available in our conversation.",
    )
    .replace(/\s+/g, " ")
    .trim();
}
export function speechChunks(text: string, max = 700): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const word of text.trim().split(/\s+/)) {
    if (current && current.length + word.length + 1 > max) {
      chunks.push(current);
      current = "";
    }
    if (word.length > max) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += max)
        chunks.push(word.slice(i, i + max));
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) chunks.push(current);
  return chunks;
}
