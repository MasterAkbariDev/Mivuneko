// Rewrites text so a TTS engine says it the way a person would. The engine spells out
// unknown abbreviations letter by letter ("OK" -> "oh kay"), reads symbols badly and
// stumbles on names, so everything spoken goes through this first. See docs/VOICE.md.
const WORDS: [RegExp, string][] = [
  [/\bO\.K\.?(?=\s|$)/g, "okay"],
  [/\bok\b/gi, "okay"],
  [/\bMivuneko\b/gi, "Mee voo neh ko"],
  [/\bJS\b/g, "JavaScript"],
  [/\bTS\b/g, "TypeScript"],
  [/\bAPI\b/g, "A P I"],
  [/\bCPU\b/g, "C P U"],
  [/\bRAM\b/g, "ram"],
  [/\bUI\b/g, "U I"],
  [/\bAI\b/g, "A I"],
  [/\bmacOS\b/g, "mac O S"],
  [/\bvs\.?(?=\s)/gi, "versus"],
  [/\be\.g\.,?/gi, "for example,"],
  [/\bi\.e\.,?/gi, "that is,"],
  [/\betc\.?/gi, "and so on"],
  [/\bthx\b/gi, "thanks"],
  [/\bpls\b/gi, "please"],
  [/\bbtw\b/gi, "by the way"],
];
// Emoji and pictographs are skipped silently instead of being read out.
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
export function pronounce(
  text: string,
  extra: [string, string][] = [],
): string {
  let out = text.replace(EMOJI, " ");
  for (const [pattern, spoken] of WORDS) out = out.replace(pattern, spoken);
  for (const [word, spoken] of extra)
    out = out.replace(
      new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"),
      spoken,
    );
  return out
    .replace(/&/g, " and ")
    .replace(/(\d)%/g, "$1 percent")
    .replace(/\+/g, " plus ")
    .replace(/(\w)\/(\w)/g, "$1 or $2")
    .replace(/\s*[-–—]{2,}\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}
