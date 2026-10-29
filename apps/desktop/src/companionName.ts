import type { Preferences } from "./preferences";
import { characters } from "./lunaModel";
export function companionName(p: Preferences) {
  return (
    p.companionName.trim() ||
    (p.renderer === "sample-vrm"
      ? "Haru"
      : p.renderer === "custom-vrm"
        ? "Companion"
        : characters[p.character].name)
  );
}
