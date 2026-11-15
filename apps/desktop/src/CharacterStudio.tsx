import { Icon } from "./Icon";
import { CharacterPackLibrary } from "./CharacterPackLibrary";
import { SpriteCanvas } from "./SpriteCanvas";
import { spriteFrame } from "./spriteFrames";
import { useState } from "react";
import { characters } from "./lunaModel";
import { companionName } from "./companionName";
import { gestureConfig } from "../../../packages/shared-schemas/procedural-gesture";
import { updatePreferences, usePreferences } from "./preferences";
import type { CharacterId } from "../../../packages/shared-schemas/preferences.ts";
import { ModelSettings } from "./ModelSettings";
import { usePetSession } from "./session";
import { CompanionVisual } from "./CompanionVisual";

export function CharacterStudio({
  onOpenGuide,
  onOpenVoice,
}: {
  onOpenGuide: () => void;
  onOpenVoice?: () => void;
}) {
  const p = usePreferences();
  const session = usePetSession();
  const [format, setFormat] = useState<"2D" | "2.5D" | "3D">(
    p.renderer !== "2d" ? "3D" : p.illustrationDepth ? "2.5D" : "2D",
  );
  return (
    <section className="character-studio" aria-label="Character studio">
      <div className="character-browser-toolbar">
        {" "}
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
              onClick={() => {
                setFormat(value);
                if (value === "3D" && p.renderer === "2d")
                  updatePreferences({
                    renderer: "sample-vrm",
                    activePackId: "",
                    activePackName: "",
                    petExpression: "auto",
                  });
                else if (
                  value !== "3D" &&
                  (p.renderer !== "2d" ||
                    p.illustrationDepth !== (value === "2.5D"))
                )
                  updatePreferences({
                    renderer: "2d",
                    character: value === "2.5D" ? "mochi" : "luna",
                    illustrationDepth: value === "2.5D",
                    activePackId: "",
                    activePackName: "",
                    petExpression: "auto",
                  });
              }}
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
        <div className="character-studio-head">
          <button
            className="primary"
            onClick={() => {
              document
                .querySelector<HTMLInputElement>(
                  format === "3D"
                    ? 'input[aria-label="Import VRM file"]'
                    : '.pack-library input[type="file"]',
                )
                ?.click();
            }}
          >
            <Icon name="plus" />
            Import character
          </button>
        </div>
      </div>
      <aside className="character-inspector">
        <h2>{companionName(p)}</h2>
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
        <h3>Expressions</h3>
        <div className="inspector-expressions">
          {["happy", "sad", "sleeping", "love", "thinking", "excited"].map(
            (expression) => (
              <button
                key={expression}
                data-expression={expression}
                aria-pressed={p.petExpression === expression}
                onClick={() =>
                  updatePreferences({
                    petExpression: expression as typeof p.petExpression,
                  })
                }
              >
                {p.renderer === "2d" && !p.activePackId ? (
                  <SpriteCanvas
                    className="expression-tile-art"
                    frame={spriteFrame(
                      p.character,
                      expression as any,
                      "stand",
                      0,
                      0,
                    )}
                  />
                ) : p.renderer === "sample-vrm" &&
                  ["happy", "sad", "sleeping"].includes(expression) ? (
                  <img
                    className="expression-tile-art"
                    src={`/models/haru-${["happy", "sad", "sleeping"].includes(expression) ? expression : "happy"}.png`}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <Icon name="sparkle" />
                )}
                <span>
                  {expression === "sleeping"
                    ? "Sleepy"
                    : expression.charAt(0).toUpperCase() + expression.slice(1)}
                </span>
              </button>
            ),
          )}
        </div>
        {p.renderer !== "2d" && (
          <details className="extra-expressions">
            <summary>More expressions</summary>
            <div className="inspector-expressions">
              {["bored", "nervous", "relieved", "embarrassed"].map(
                (expression) => (
                  <button
                    key={expression}
                    data-expression={expression}
                    aria-pressed={p.petExpression === expression}
                    onClick={() =>
                      updatePreferences({
                        petExpression: expression as typeof p.petExpression,
                      })
                    }
                  >
                    {expression.charAt(0).toUpperCase() + expression.slice(1)}
                  </button>
                ),
              )}
            </div>
          </details>
        )}
        {p.renderer !== "2d" && (
          <>
            <details className="gesture-options">
              <summary>Live gestures</summary>
              <div className="inspector-expressions">
                {[
                  ["Wave", "wave", "neutral"],
                  ["Nod", "rest", "nod"],
                  ["Bow", "rest", "bow"],
                  ["Stretch", "stretch", "tilt"],
                  ["Clap", "clap", "neutral"],
                ].map(([label, arms, head]) => (
                  <button
                    key={label}
                    onClick={() =>
                      updatePreferences({
                        petGesture: gestureConfig({
                          arms,
                          head,
                          intensity: 0.65,
                          tempo: 1,
                          duration: 4,
                        }),
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={() =>
                    updatePreferences({ petMode: "lie", petExpression: "auto" })
                  }
                >
                  Lie down
                </button>
              </div>
            </details>
          </>
        )}
        <h3>Voice</h3>
        <button className="inspector-voice" onClick={onOpenVoice}>
          Character voice settings ↗
        </button>
        <button
          className="primary"
          onClick={() => {
            if ("__TAURI_INTERNALS__" in window)
              void import("@tauri-apps/api/core").then(({ invoke }) =>
                invoke("recover_pet", { center: false }),
              );
          }}
        >
          Use character
        </button>
        <button onClick={onOpenGuide}>Character guide</button>
      </aside>
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
    </section>
  );
}
