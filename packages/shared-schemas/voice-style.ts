import type { Mood } from "./index.ts";
// Character voice pack (assets/characters/<id>/voice/voice.json). Speaker blends are
// resolved natively; the app only needs the delivery numbers. See docs/VOICE.md.
export interface MoodStyle {
  speed?: number;
  pause?: number;
  gain?: number;
}
export interface VoicePack {
  engine: "kokoro";
  speed: number;
  gain: number;
  moods?: Record<string, MoodStyle>;
}
export interface Delivery {
  // Synthesis speed (Kokoro length scale inverse): below 1 is slower.
  speed: number;
  gain: number;
  // Multiplies every pause between phrases.
  pauseScale: number;
}
// Used when a pack does not define a mood: gentle changes in tempo, loudness and pauses.
const MOODS: Record<string, Required<MoodStyle>> = {
  idle: { speed: 1, pause: 1, gain: 1 },
  happy: { speed: 1.05, pause: 0.85, gain: 1 },
  celebrating: { speed: 1.1, pause: 0.75, gain: 1.05 },
  surprised: { speed: 1.05, pause: 0.85, gain: 1.03 },
  curious: { speed: 1, pause: 1.05, gain: 1 },
  confused: { speed: 0.95, pause: 1.3, gain: 0.97 },
  concerned: { speed: 0.92, pause: 1.25, gain: 0.95 },
  sad: { speed: 0.9, pause: 1.5, gain: 0.9 },
  angry: { speed: 1.05, pause: 0.8, gain: 1.1 },
};
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
export function deliveryFor(mood: Mood | string, pack: VoicePack): Delivery {
  const fallback = MOODS[mood] ?? MOODS.idle;
  const own = pack.moods?.[mood] ?? {};
  return {
    speed: clamp(pack.speed * (own.speed ?? fallback.speed), 0.5, 1.6),
    gain: clamp(pack.gain * (own.gain ?? fallback.gain), 0.2, 1.5),
    pauseScale: clamp(own.pause ?? fallback.pause, 0.3, 3),
  };
}
export interface Phrase {
  text: string;
  // Silence after this phrase, before the next one starts.
  pauseMs: number;
}
const PAUSES: Record<string, number> = {
  ".": 480,
  "!": 420,
  "?": 520,
  "…": 700,
  ";": 320,
  ":": 300,
  ",": 200,
  "—": 240,
};
// Splits speech into phrases so the first can start playing while the rest are
// still being synthesized, with a human-sized pause after each.
export function splitSpeech(text: string, maxChars = 140): Phrase[] {
  const clean = text.replace(/[ \t]+/g, " ").trim();
  if (!clean) return [];
  const phrases: Phrase[] = [];
  const parts = clean.split(/(?<=[.!?…;:])\s+|\n+/);
  for (const part of parts) {
    const piece = part.trim();
    if (!/[\p{L}\p{N}]/u.test(piece)) continue;
    const end = piece.match(/(\.\.\.|…|[.!?;:])["')\]]*$/)?.[1] ?? "";
    const base = PAUSES[end === "..." ? "…" : end] ?? 300;
    if (piece.length <= maxChars) {
      phrases.push({ text: piece, pauseMs: base });
      continue;
    }
    // Long run-on: break at commas, with a shorter pause.
    let buffer = "";
    for (const clause of piece.split(/(?<=,)\s+/)) {
      if (buffer && (buffer + " " + clause).length > maxChars) {
        phrases.push({ text: buffer, pauseMs: PAUSES[","] });
        buffer = clause;
      } else buffer = buffer ? `${buffer} ${clause}` : clause;
    }
    if (buffer) phrases.push({ text: buffer, pauseMs: base });
  }
  // The last phrase needs no trailing silence.
  if (phrases.length) phrases[phrases.length - 1].pauseMs = 0;
  return phrases;
}
