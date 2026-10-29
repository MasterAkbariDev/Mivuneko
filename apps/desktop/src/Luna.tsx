import { useEffect, useState, type CSSProperties } from "react";
import type { Mood } from "../../../packages/shared-schemas/index.ts";
import type {
  CharacterId,
  PetExpression,
  PetMode,
} from "../../../packages/shared-schemas/preferences.ts";
import { SpriteCanvas } from "./SpriteCanvas";
import { spriteFrame } from "./spriteFrames";
import { characters, lunaPose } from "./lunaModel";
/** Two-layer crossfade keeps the character visible during expression changes. */
export function Luna({
  mood,
  mouth = 0,
  mode = "auto",
  expression = "auto",
  effects = true,
  character = "luna",
  direction = 0,
}: {
  mood: Mood;
  mouth?: number;
  mode?: PetMode;
  expression?: PetExpression;
  effects?: boolean;
  character?: CharacterId;
  direction?: number;
}) {
  const pose = lunaPose(mood, mode, expression);
  const model = characters[character];
  const [tick, setTick] = useState(0);
  const moving = expression === "auto" && (mode === "walk" || mode === "run");
  useEffect(() => {
    setTick(0);
    if (!moving) return;
    const timer = setInterval(
      () => setTick((t) => t + 1),
      mode === "run" ? 85 : 140,
    );
    return () => clearInterval(timer);
  }, [moving, mode, character]);
  const selected = spriteFrame(
    character,
    pose,
    mode,
    direction,
    tick,
    expression === "auto",
  );
  const frame = {
    ...selected,
    key: `${character}-${selected.image}-${selected.column}-${selected.row}-${selected.mirror}`,
  };
  const [frames, setFrames] = useState([frame]);
  useEffect(() => {
    setFrames((old) =>
      moving
        ? [frame]
        : old.at(-1)?.key === frame.key
          ? old
          : [old.at(-1)!, frame],
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
      data-direction={selected.facing}
      role="img"
      aria-label={`${model.name} 2D companion, ${pose}`}
    >
      {frames.map((item, index) => (
        <SpriteCanvas
          key={item.key}
          frame={item}
          className={`luna-sprite ${frames.length > 1 && index === frames.length - 1 ? "luna-sprite-enter" : ""}`}
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
