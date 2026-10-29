import { useSyncExternalStore } from "react";
import type { Mood } from "../../../packages/shared-schemas/index.ts";
import { moods } from "../../../packages/character/index.ts";
import { isNative } from "./broker";
export interface PetEvent {
  mood: Mood;
  text: string;
  at: number;
  mouth?: number;
  emotion?: Mood;
}
let current: PetEvent = {
  mood: "idle",
  text: "",
  at: 0,
};
const listeners = new Set<() => void>();
function receive(value: unknown) {
  const p = value as Partial<PetEvent> | null;
  if (
    !p ||
    !moods.includes(p.mood as Mood) ||
    typeof p.text !== "string" ||
    p.text.length > 500 ||
    typeof p.at !== "number" ||
    !Number.isFinite(p.at) ||
    p.at < current.at
  )
    return;
  current = {
    ...p,
    emotion: moods.includes(p.emotion as Mood) ? p.emotion : p.mood,
  } as PetEvent;
  listeners.forEach((fn) => fn());
}
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("mivuneko.session")
    : null;
channel?.addEventListener("message", (e) => receive(e.data));
if (isNative) {
  void import("@tauri-apps/api/event")
    .then(({ listen }) =>
      listen<PetEvent>("pet-state", (e) => receive(e.payload)),
    )
    .then(() => import("@tauri-apps/api/core"))
    .then(({ invoke }) => invoke<PetEvent>("get_pet_state"))
    .then(receive)
    .catch(() => {});
}
export function publishPet(
  mood: Mood,
  text: string,
  mouth = 0,
  emotion: Mood = mood,
) {
  const event = {
    mood,
    emotion,
    text: text.slice(0, 500),
    at: Date.now(),
    mouth: Math.max(0, Math.min(1, mouth)),
  };
  receive(event);
  if (isNative) {
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("publish_pet_state", { event }))
      .catch(() => {});
  } else channel?.postMessage(event);
}
export function usePetSession() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => current,
  );
}
