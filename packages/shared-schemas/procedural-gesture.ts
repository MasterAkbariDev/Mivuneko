export interface ProceduralGesture {
  arms:
    | "rest"
    | "open"
    | "raised"
    | "folded"
    | "point-left"
    | "point-right"
    | "wave"
    | "clap"
    | "stretch";
  head: "neutral" | "nod" | "shake" | "tilt" | "bow";
  intensity: number;
  tempo: number;
  duration: number;
  started: number;
}
export function gestureConfig(
  value: unknown,
  started = Date.now(),
): ProceduralGesture | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const arms = [
    "rest",
    "open",
    "raised",
    "folded",
    "point-left",
    "point-right",
    "wave",
    "clap",
    "stretch",
  ];
  const head = ["neutral", "nod", "shake", "tilt", "bow"];
  if (!arms.includes(String(v.arms)) || !head.includes(String(v.head)))
    return null;
  const number = (n: unknown, fallback: number, min: number, max: number) =>
    typeof n === "number" && Number.isFinite(n)
      ? Math.max(min, Math.min(max, n))
      : fallback;
  return {
    arms: v.arms as ProceduralGesture["arms"],
    head: v.head as ProceduralGesture["head"],
    intensity: number(v.intensity, 0.65, 0.1, 1),
    tempo: number(v.tempo, 1, 0.3, 2),
    duration: number(v.duration, 4, 1, 12),
    started: number(v.started, started, 0, Date.now() + 1000),
  };
}
