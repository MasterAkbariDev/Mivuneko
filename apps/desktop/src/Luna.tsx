import { useEffect, useState, type CSSProperties } from "react";
import type { Mood } from "../../../packages/shared-schemas/index.ts";
import type {
  CharacterId,
  PetExpression,
  PetMode,
} from "../../../packages/shared-schemas/preferences.ts";
import { characters, lunaPose } from "./lunaModel";
/** Two-layer crossfade keeps the character visible during expression changes. */
export function Luna({
  mood,
  mouth = 0,
  mode = "auto",
  expression = "auto",
  effects = true,
  character = "luna",
}: {
  mood: Mood;
  mouth?: number;
  mode?: PetMode;
  expression?: PetExpression;
  effects?: boolean;
  character?: CharacterId;
}) {
  const pose = lunaPose(mood, mode, expression);
  const model = characters[character];
  const movePose =
    character === "luna" &&
    expression === "auto" &&
    ["idle", "happy"].includes(mood)
      ? mode === "walk"
        ? [3, 0, 1]
        : mode === "run"
          ? [3, 1, 1]
          : mode === "sit"
            ? [3, 2, 1]
            : null
      : null;
  const [atlas, column, row] = movePose ?? model.poses[pose];
  const frame = {
    image: model.atlases[atlas],
    column,
    row,
    key: `${character}-${atlas}-${column}-${row}`,
  };
  const [frames, setFrames] = useState([frame]);
  useEffect(() => {
    setFrames((old) =>
      old.at(-1)?.key === frame.key ? old : [old.at(-1)!, frame],
    );
    const timer = setTimeout(
      () => setFrames((old) => (old.length > 1 ? [old[old.length - 1]] : old)),
      380,
    );
    return () => clearTimeout(timer);
  }, [frame.key]);
  const effect =
    pose === "happy" || pose === "shy" || pose === "love" || pose === "wink"
      ? "hearts"
      : pose === "celebrating" ||
          pose === "dancing" ||
          pose === "excited" ||
          pose === "proud"
        ? "sparkles"
        : pose === "sleeping"
          ? "dreams"
          : pose === "thinking" || pose === "confused" || pose === "determined"
            ? "thoughts"
            : pose === "listening"
              ? "listening"
              : pose === "angry"
                ? "anger"
                : pose === "sad" || pose === "crying"
                  ? "rain"
                  : pose === "joking" || pose === "teasing"
                    ? "playful"
                    : "none";
  return (
    <div
      className={`luna-model motion-${pose} mode-${mode}`}
      data-model={character}
      data-emotion={mood}
      data-pose={pose}
      data-frame={frame.key}
      role="img"
      aria-label={`${model.name} 2D companion, ${pose}`}
    >
      {frames.map((item, index) => (
        <div
          key={item.key}
          className={`luna-sprite ${frames.length > 1 && index === frames.length - 1 ? "luna-sprite-enter" : ""}`}
          style={
            {
              backgroundImage: `url('${item.image}')`,
              backgroundPosition: `${item.column * 50}% ${item.row * 100}%`,
              "--mouth": Math.min(1, Math.max(0, mouth)),
            } as CSSProperties
          }
        />
      ))}
      {effects && effect !== "none" && (
        <div className={`luna-effects effect-${effect}`} aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              style={{ "--effect-index": index } as CSSProperties}
            >
              {effect === "hearts"
                ? "♡"
                : effect === "dreams"
                  ? "z"
                  : effect === "thoughts"
                    ? "·"
                    : effect === "rain"
                      ? "•"
                      : effect === "anger"
                        ? "╬"
                        : effect === "listening"
                          ? ")"
                          : effect === "playful"
                            ? "♪"
                            : "✦"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
