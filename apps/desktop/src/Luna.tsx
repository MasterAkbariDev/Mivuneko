import { useEffect, useState, type CSSProperties } from "react";
import type { Mood } from "../../../packages/shared-schemas/index.ts";
import type {
  PetExpression,
  PetMode,
} from "../../../packages/shared-schemas/preferences.ts";
import { lunaModel, lunaPose } from "./lunaModel";
/** Reusable sprite-based 2D model with twelve poses, motion and local effects. */
export function Luna({
  mood,
  mouth = 0,
  mode = "auto",
  expression = "auto",
  effects = true,
}: {
  mood: Mood;
  mouth?: number;
  mode?: PetMode;
  expression?: PetExpression;
  effects?: boolean;
}) {
  const pose = lunaPose(mood, mode, expression);
  const [talkFrame, setTalkFrame] = useState(false);
  useEffect(() => {
    if (pose !== "speaking" || expression !== "speaking") return;
    const timer = setInterval(() => setTalkFrame((frame) => !frame), 180);
    return () => clearInterval(timer);
  }, [pose, expression]);
  const rendered =
    pose === "speaking" && mouth < 0.08 && !talkFrame ? "idle" : pose;
  const [atlas, column, row] = lunaModel.poses[rendered];
  const effect =
    pose === "happy" || pose === "shy"
      ? "hearts"
      : pose === "celebrating" || pose === "dancing"
        ? "sparkles"
        : pose === "sleeping"
          ? "dreams"
          : pose === "thinking"
            ? "thoughts"
            : pose === "listening"
              ? "listening"
              : pose === "angry"
                ? "anger"
                : pose === "sad"
                  ? "rain"
                  : "none";
  return (
    <div
      className={`luna-model motion-${pose} mode-${mode}`}
      data-model={lunaModel.id}
      data-emotion={mood}
      data-pose={pose}
      role="img"
      aria-label={`Luna 2D companion, ${pose}`}
    >
      <div
        className="luna-sprite"
        style={
          {
            backgroundImage: `url('${lunaModel.atlases[atlas]}')`,
            backgroundPosition: `${column * 50}% ${row * 100}%`,
          } as CSSProperties
        }
      />
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
                          : "✦"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
