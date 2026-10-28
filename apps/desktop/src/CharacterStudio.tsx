import { Luna } from "./Luna";
import { characters } from "./lunaModel";
import { PetSettings } from "./PetSettings";
import { updatePreferences, usePreferences } from "./preferences";
import type { CharacterId } from "../../../packages/shared-schemas/preferences.ts";

export function CharacterStudio() {
  const p = usePreferences();
  return (
    <section className="character-studio" aria-label="Character studio">
      <div className="character-studio-head">
        <div>
          <h2>Meet your companions</h2>
          <p>
            Choose a character, then try expressions, movement and voice below.
            Changes update the desktop pet live.
          </p>
        </div>
        <div
          className="character-live-preview"
          aria-label="Live character preview"
        >
          <Luna
            character={p.character}
            mood="idle"
            mode={p.petMode}
            expression={p.petExpression}
            effects={p.petEffects}
          />
        </div>
      </div>
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
            aria-pressed={p.character === id}
            onClick={() => updatePreferences({ character: id })}
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
        characters use six drawn poses. Walking and running move the desktop
        window; preview your local voice below.
      </p>
      <PetSettings />
    </section>
  );
}
