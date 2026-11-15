import { usePreferences } from "./preferences";
import { Luna } from "./Luna";
import { Icon } from "./Icon";
export function CompanionPortrait() {
  const p = usePreferences();
  return (
    <span className="companion-portrait" aria-hidden="true">
      {p.activePackId || p.renderer === "custom-vrm" ? (
        <Icon name="cat" />
      ) : p.renderer === "sample-vrm" ? (
        <img src="/models/haru-preview.png" alt="" />
      ) : (
        <Luna
          mood="idle"
          mode="stand"
          expression="auto"
          effects={false}
          character={p.character}
        />
      )}
    </span>
  );
}
