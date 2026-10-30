import type { Mood } from "./index.ts";

// Streaming view of a tagged reply (crates/gemini-client/src/tagged.rs is the authority for
// the finished reply): "@meta emotion=…" header, Markdown body, optional final "@actions"
// line. While streaming, only the body is revealed: the header and any line starting with
// "@" are held back until complete and then dropped, so a partial "@act…" is never shown
// or spoken. Actions are never read from a partial stream.

const EMOTIONS = new Set<Mood>([
  "idle",
  "happy",
  "curious",
  "confused",
  "concerned",
  "celebrating",
  "angry",
  "sad",
  "surprised",
  "crying",
  "shy",
  "love",
  "excited",
  "teasing",
  "joking",
  "wink",
  "proud",
  "determined",
  "sleeping",
]);

export interface TaggedProgress {
  /** Body text safe to show and speak so far. */
  visible: string;
  /** Emotion from a complete header, if one arrived and is valid. */
  emotion?: Mood;
}

export function taggedProgress(raw: string): TaggedProgress {
  const lines = raw.split("\n");
  // The last element is an unfinished line unless the raw text ends with a newline.
  const complete = lines.length - 1;
  let emotion: Mood | undefined;
  let start = 0;
  if (lines[0].trimStart().startsWith("@")) {
    if (complete === 0) return { visible: "" };
    const meta = /^\s*@meta\b(.*)$/.exec(lines[0]);
    const value = meta && /\bemotion=([a-z]+)/i.exec(meta[1])?.[1];
    if (value && EMOTIONS.has(value.toLowerCase() as Mood))
      emotion = value.toLowerCase() as Mood;
    start = 1;
  }
  const shown: string[] = [];
  let fenced = false;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (/^(```|~~~)/.test(trimmed)) fenced = !fenced;
    else if (!fenced && trimmed.startsWith("@")) {
      // A tag line (or a partial one) is never revealed.
      if (i === complete || /^@(meta|actions)\b/.test(trimmed)) continue;
    }
    shown.push(line);
  }
  return { visible: shown.join("\n"), ...(emotion ? { emotion } : {}) };
}
