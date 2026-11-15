export const voiceDeliveries = {
  natural: {
    label: "Natural",
    direction:
      "Speak like a relaxed live host: conversational timing, varied but restrained pitch, and natural phrase endings. Let the requested emotion guide the performance.",
  },
  playful: {
    label: "Playful",
    direction:
      "A bright, playful live-host delivery with lively pitch variation and a light smile. Use small expressive pauses. Keep every word clear; avoid squeaking, exaggerated accents or inserted laughter.",
  },
  warm: {
    label: "Warm",
    direction:
      "Warm, reassuring and attentive, with gentle pitch movement, soft emphasis and natural breathing spaces. Preserve precise articulation and all of the requested text.",
  },
  dramatic: {
    label: "Expressive",
    direction:
      "An expressive live performance with clear emotional contrast, measured anticipation and dynamic emphasis. Match the requested mood without shouting or adding words, vocal effects or laughter.",
  },
} as const;
export type VoiceDelivery = keyof typeof voiceDeliveries;
const marker = "\nDelivery style: ";
export function deliverySelection(
  instruction: string,
): VoiceDelivery | "custom" {
  return (
    (Object.keys(voiceDeliveries) as VoiceDelivery[]).find((key) =>
      instruction.endsWith(marker + voiceDeliveries[key].direction),
    ) ?? "custom"
  );
}
export function applyVoiceDelivery(
  instruction: string,
  key: VoiceDelivery,
): string {
  const base = instruction.split(marker)[0].trim();
  return base.slice(0, 650) + marker + voiceDeliveries[key].direction;
}
