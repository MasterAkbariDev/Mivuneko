import { characters } from "./lunaModel";
import { PetSettings } from "./PetSettings";
import { updatePreferences, usePreferences } from "./preferences";
import type { CharacterId } from "../../../packages/shared-schemas/preferences.ts";
import { ModelSettings } from "./ModelSettings";
import { CompanionVisual } from "./CompanionVisual";

export function CharacterStudio() {
  const p = usePreferences();
  return (
    <section className="character-studio" aria-label="Character studio">
      <div className="character-studio-head">
        <div>
          <h2>Meet your companions</h2>
          <p>
            Choose a character, then try expressions, movement and effects
            below. Changes update the desktop pet live.
          </p>
        </div>
        <div
          className="character-live-preview"
          aria-label="Live character preview"
        >
          <CompanionVisual />
        </div>
      </div>
      <ModelSettings />
      <div
        className="character-gallery"
        role="group"
        aria-label="Choose a companion"
      >
        {(Object.keys(characters) as CharacterId[]).map((id) => (
          <button
            key={id}
            type="button"
            className="character-choice"
            aria-pressed={p.renderer === "2d" && p.character === id}
            onClick={() => updatePreferences({ character: id, renderer: "2d" })}
          >
            <span
              className="character-choice-art"
              style={{ backgroundImage: `url('${characters[id].atlases[0]}')` }}
            />
            <strong>{characters[id].name}</strong>
          </button>
        ))}
      </div>
      <p className="hint">
        Luna has individual expression artwork and smooth transitions. The other
        characters use six drawn poses. Haru and imported VRM models use live
        expressions, lip sync and gaze. Walking and running move the desktop
        window.
      </p>
      <PetSettings />
    </section>
  );
}
