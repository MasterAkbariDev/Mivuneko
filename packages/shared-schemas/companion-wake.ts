import type { Preferences } from "./preferences.ts";
/** Waking never changes size, location, or the user's other expression choices. */
export function wakeCompanion(p: Preferences): Partial<Preferences> {
  return {
    ...(p.petMode === "sleep" ? { petMode: "stand" as const } : {}),
    ...(p.petExpression === "sleeping"
      ? { petExpression: "auto" as const }
      : {}),
    ...(/^(?:sleep|sleeping)$/.test(p.customPackPose)
      ? { customPackPose: "" }
      : {}),
  };
}
