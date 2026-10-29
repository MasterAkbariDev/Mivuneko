import type { Preferences } from "./preferences";
import { characters } from "./lunaModel";
export function companionName(p: Preferences) {
  return (
    p.companionName.trim() ||
    (p.activePackId
      ? p.activePackName || "Companion"
      : p.renderer === "sample-vrm"
        ? "Haru"
        : p.renderer === "custom-vrm"
          ? p.customModelName || "Companion"
          : characters[p.character].name)
  );
}
