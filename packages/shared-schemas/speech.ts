import { narrateTables } from "./markdown-tables.ts";
import type { AgentReply } from "./index.ts";
// Narrate all prose in order. A provider's optional short summary must not replace it.
export function speakable(
  reply: Pick<AgentReply, "text" | "speech">,
  codeShown = false,
): string {
  let text = (reply.text || reply.speech || "").replace(
    /&#(?:x20|32);|&nbsp;/gi,
    " ",
  );
  text = text.replace(
    /(?:here(?:'s| is)|see|the)\s+(?:(?:the|an?)\s+)?(?:code|example)(?:\s+(?:is\s+)?(?:below|above))?\s*[:.]/gi,
    "The code example is saved in our conversation.",
  );
  text = narrateTables(text);
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
  const result = text
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
  return codeShown
    ? result.replace(
        /(?:A code example is available|The code example is saved) in our conversation\./g,
        "Here’s the code example.",
      )
    : result;
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

// Where a streamed reply can safely be cut for speech: just after a finished sentence or a
// finished line, never inside an open code fence, never inside a table (which is narrated
// whole) and never right after a bare list number such as "1.".
function safeEnd(text: string, from: number): number {
  let best = from,
    fenced = false,
    lineStart = 0;
  for (let i = 0; i < text.length; i++) {
    if (i === lineStart) {
      const line = text.slice(i, text.indexOf("\n", i) + 1 || text.length);
      const trimmed = line.trimStart();
      if (/^(```|~~~)/.test(trimmed)) fenced = !fenced;
      if (fenced || trimmed.startsWith("|") || /^(```|~~~)/.test(trimmed)) {
        // Skip to the end of this line; it can only end a chunk once a fence closes.
        const end = text.indexOf("\n", i);
        if (end < 0) break;
        if (!fenced && !trimmed.startsWith("|") && end + 1 > from)
          best = end + 1;
        i = end;
        lineStart = end + 1;
        continue;
      }
    }
    const c = text[i];
    if (c === "\n") {
      lineStart = i + 1;
      // A finished line ends a chunk unless the next line continues a table.
      if (
        i + 1 > from &&
        !text
          .slice(i + 1)
          .trimStart()
          .startsWith("|")
      )
        best = i + 1;
      continue;
    }
    if (
      /[.!?…]/.test(c) &&
      /\s/.test(text[i + 1] ?? "") &&
      !/^\s*\d+[.)]$/.test(text.slice(lineStart, i + 1)) &&
      i + 1 > from
    )
      best = i + 1;
  }
  return best;
}

/**
 * Incremental `speakable` for a reply that is still streaming. Call it with the full visible
 * text so far; it returns the newly speakable part (possibly ""), cut only at safe
 * boundaries. Call once more with `final = true` to flush the rest.
 */
export function speakableStream(codeShown = false) {
  let spoken = "";
  return (visible: string, final = false): string => {
    // Align with what was already spoken, ignoring leading whitespace, so the final
    // (authoritative, trimmed) reply text continues the stream without repeating it.
    const base = visible.trimStart(),
      done = spoken.trimStart();
    if (!base.startsWith(done)) return "";
    const consumed = visible.length - base.length + done.length;
    const end = final ? visible.length : safeEnd(visible, consumed);
    if (end <= consumed) return "";
    spoken = visible.slice(0, end);
    return speakable({ text: visible.slice(consumed, end) }, codeShown);
  };
}
