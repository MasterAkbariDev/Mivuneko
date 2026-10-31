const HALLUCINATIONS = new Set([
  "thanks for watching",
  "thank you for watching",
  "thank you so much for watching",
  "you",
]);
const key = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
// Whisper pads silence with tags and stock phrases; strip them before chat sees them.
export function cleanTranscript(input: string): string {
  let text = String(input ?? "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\*[^*\n]*\*/g, " ")
    .replace(/♪[^♪]*♪?/g, " ")
    .replace(/[♪♫]/g, " ")
    .replace(/>>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const whole = key(text);
  if (!whole || HALLUCINATIONS.has(whole) || /^subtitles? by\b/.test(whole))
    return "";
  const words = text.split(" ");
  for (let n = Math.min(12, Math.floor(words.length / 3)); n >= 3; n--) {
    for (let i = 0; i + 3 * n <= words.length;) {
      let runs = 1;
      while (
        i + (runs + 1) * n <= words.length &&
        key(words.slice(i, i + n).join(" ")) ===
          key(words.slice(i + runs * n, i + (runs + 1) * n).join(" "))
      )
        runs++;
      if (runs > 2) words.splice(i + n, (runs - 1) * n);
      else i++;
    }
  }
  text = words.join(" ").trim();
  return key(text) ? text : "";
}
