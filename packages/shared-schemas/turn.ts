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
