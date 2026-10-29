import { CharacterPackLibrary } from "./CharacterPackLibrary";
import { SpriteCanvas } from "./SpriteCanvas";
import { spriteFrame } from "./spriteFrames";
import { useState } from "react";
import { characters } from "./lunaModel";
import { PetSettings } from "./PetSettings";
import { updatePreferences, usePreferences } from "./preferences";
import type { CharacterId } from "../../../packages/shared-schemas/preferences.ts";
import { ModelSettings } from "./ModelSettings";
import { usePetSession } from "./session";
import { CompanionVisual } from "./CompanionVisual";

export function CharacterStudio({ onOpenGuide }: { onOpenGuide: () => void }) {
  const p = usePreferences();
  const session = usePetSession();
  const [format, setFormat] = useState<"2D" | "2.5D" | "3D">(
    p.renderer !== "2d" ? "3D" : p.illustrationDepth ? "2.5D" : "2D",
  );
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
          <CompanionVisual
            mood={session.mood}
            mouth={session.mouth}
            emotion={session.emotion}
          />
        </div>
      </div>
      <div
        className="character-format-tabs"
        role="tablist"
        aria-label="Character dimensions"
      >
        {(["2D", "2.5D", "3D"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={format === value}
            aria-controls="character-models"
            id={`format-${value}`}
            onClick={() => setFormat(value)}
          >
            {value}
            <small>
              {value === "2D"
                ? "Illustrated poses"
                : value === "2.5D"
                  ? "Illustrations with depth"
                  : "Animated VRM"}
            </small>
          </button>
        ))}
      </div>
      <div
        id="character-models"
        role="tabpanel"
        aria-labelledby={`format-${format}`}
      >
        {format === "3D" ? (
          <ModelSettings only3D />
        ) : (
          <>
            <p className="hint">
              {format === "2.5D"
                ? "A dedicated illustrated companion with subtle depth and cursor-driven perspective."
                : "Illustrated companions with expressive poses and mood effects."}
            </p>
            <div
              className="character-gallery"
              role="group"
              aria-label="Choose a companion"
            >
              {(Object.keys(characters) as CharacterId[])
                .filter((id) =>
                  format === "2.5D" ? id === "mochi" : id !== "mochi",
                )
                .map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="character-choice"
                    aria-pressed={
                      !p.activePackId &&
                      p.renderer === "2d" &&
                      p.character === id &&
                      p.illustrationDepth === (format === "2.5D")
                    }
                    onClick={() =>
                      updatePreferences({
                        character: id,
                        activePackId: "",
                        activePackName: "",
                        renderer: "2d",
                        illustrationDepth: format === "2.5D",
                      })
                    }
                  >
                    <SpriteCanvas
                      className="character-choice-art"
                      frame={spriteFrame(id, "idle", "stand", 0, 0)}
                    />
                    <strong>{characters[id].name}</strong>
                  </button>
                ))}
            </div>
          </>
        )}
      </div>
      <button className="character-guide-toggle" onClick={onOpenGuide}>
        Creating characters & voices - Open complete guide
      </button>
      <p className="hint">
        Luna has individual expression artwork and smooth transitions. The other
        illustrated characters have individual mood drawings and directional
        motion frames. Haru and imported VRM models use live expressions, lip
        sync and gaze. Walking and running move the desktop window.
      </p>
      <CharacterPackLibrary
        format={format === "3D" ? "3d" : format === "2.5D" ? "2.5d" : "2d"}
        onImported={(value) =>
          setFormat(value === "3d" ? "3D" : value === "2.5d" ? "2.5D" : "2D")
        }
      />
      <PetSettings />
    </section>
  );
}
