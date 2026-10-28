import type { Mood } from "../shared-schemas/index.ts";
export const moods: Mood[] = [
  "idle",
  "listening",
  "thinking",
  "speaking",
  "angry",
  "sad",
  "surprised",
  "happy",
  "curious",
  "confused",
  "concerned",
  "celebrating",
  "sleeping",
  "error",
];
export function nextMood(current: Mood): Mood {
  return moods[(moods.indexOf(current) + 1) % moods.length];
}
