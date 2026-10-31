// Turn-taking rules shared by the open mic. Pure text and number checks.

// Speech must last this long over the character before it counts as an interruption;
// shorter bursts (a cough, a click, a speaker pop) are ignored.
export const BARGE_IN_MS = 400;

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

// True when a transcript heard while the character was talking is just her own voice
// coming back through the microphone: nearly every word is in what she is saying.
export function echoOfSpoken(transcript: string, spoken: string): boolean {
  const heard = words(transcript);
  if (heard.length < 2) return false;
  const said = new Set(words(spoken));
  return heard.filter((w) => said.has(w)).length / heard.length >= 0.8;
}

// Quick replies: how long a pause ends the recording before the text is checked.
export const QUICK_SILENCE_MS = 700;

// Words that almost never end a thought, in English and Persian.
const UNFINISHED = new Set(
  (
    "and but or so because to of the a an with for in on at if that then like " +
    "um uh my your about from is are was i we you they it " +
    "و که ولی اما چون اگه اگر تا با از برای یعنی اِم ام این اون یه من"
  ).split(" "),
);

// True when a transcript reads like a finished sentence. Final punctuation decides;
// without it, the last word must not be a connective such as "and" or "to".
export function looksFinished(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/(?:\.{2,}|…|[,;:،—-])["')\]]*$/.test(t)) return false;
  if (/[.!?؟。]["')\]]*$/.test(t)) return true;
  const last = words(t).at(-1);
  return !!last && !UNFINISHED.has(last);
}
