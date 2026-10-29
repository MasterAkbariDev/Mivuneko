import type { Mood } from "../shared-schemas/index.ts";
export type Activity =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "working"
  | "approval"
  | "sleeping";
export type BodyAction = "idle" | "walk" | "run" | "sit" | "sleep" | "dance";
export interface CharacterState {
  activity: Activity;
  expression: Mood;
  intensity: number;
  body: BodyAction;
  mouth: number;
}
export const initialCharacter: CharacterState = {
  activity: "idle",
  expression: "idle",
  intensity: 0,
  body: "idle",
  mouth: 0,
};
export function characterFor(
  mood: Mood,
  body: BodyAction = "idle",
): CharacterState {
  const activities: Partial<Record<Mood, Activity>> = {
    listening: "listening",
    thinking: "thinking",
    speaking: "speaking",
    concerned: "approval",
    sleeping: "sleeping",
  };
  const activity = activities[mood] ?? "idle";
  return {
    activity,
    expression: mood,
    intensity: mood === "idle" ? 0 : 0.55,
    body:
      activity === "sleeping"
        ? "sleep"
        : activity === "approval" || activity === "listening"
          ? "idle"
          : body,
    mouth: 0,
  };
}
export function withMouth(
  state: CharacterState,
  amplitude: number,
): CharacterState {
  return {
    ...state,
    mouth:
      state.activity === "speaking"
        ? Math.max(0, Math.min(1, Number.isFinite(amplitude) ? amplitude : 0))
        : 0,
  };
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Display {
  id: string;
  bounds: Rect;
  scale: number;
}
export function clampPosition(
  point: { x: number; y: number },
  size: { width: number; height: number },
  rect: Rect,
) {
  return {
    x: Math.max(
      rect.x,
      Math.min(point.x, rect.x + Math.max(0, rect.width - size.width)),
    ),
    y: Math.max(
      rect.y,
      Math.min(point.y, rect.y + Math.max(0, rect.height - size.height)),
    ),
  };
}
export function recoverPosition(
  point: { x: number; y: number },
  size: { width: number; height: number },
  displays: Display[],
) {
  if (!displays.length) return point;
  const nearest = [...displays].sort(
    (a, b) =>
      Math.hypot(
        a.bounds.x + a.bounds.width / 2 - point.x,
        a.bounds.y + a.bounds.height / 2 - point.y,
      ) -
      Math.hypot(
        b.bounds.x + b.bounds.width / 2 - point.x,
        b.bounds.y + b.bounds.height / 2 - point.y,
      ),
  )[0];
  return clampPosition(point, size, nearest.bounds);
}
export function walkStep(
  x: number,
  direction: 1 | -1,
  seconds: number,
  speed: number,
  min: number,
  max: number,
) {
  const next = x + direction * Math.max(0, Math.min(seconds, 0.1)) * speed;
  return next >= max
    ? { x: max, direction: -1 as const }
    : next <= min
      ? { x: min, direction: 1 as const }
      : { x: next, direction };
}
export interface CheckInContext {
  enabled: boolean;
  now: number;
  lastInteraction: number;
  lastPrompt: number;
  unanswered: boolean;
  focus: boolean;
  fullscreen: boolean;
  quietHours: boolean;
  todayCount: number;
  maxPerDay: number;
  intervalMs: number;
}
export function shouldCheckIn(c: CheckInContext) {
  return (
    c.enabled &&
    !c.unanswered &&
    !c.focus &&
    !c.fullscreen &&
    !c.quietHours &&
    c.todayCount < c.maxPerDay &&
    c.now - Math.max(c.lastInteraction, c.lastPrompt) >=
      Math.max(300000, c.intervalMs)
  );
}

export function isQuietHour(hour: number, start: number, end: number) {
  return start === end
    ? false
    : start < end
      ? hour >= start && hour < end
      : hour >= start || hour < end;
}
