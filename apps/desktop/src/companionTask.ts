import { useSyncExternalStore } from "react";
import type { Destination } from "../../../packages/shared-schemas/desktop-intent";
export interface CompanionTask {
  destination: Destination;
  at: number;
}
let task: CompanionTask | null = null;
const listeners = new Set<() => void>();
const channel = new BroadcastChannel("mivuneko.behavior");
function receive(value: unknown) {
  const p = value as CompanionTask | null;
  if (value === null) {
    task = null;
    listeners.forEach((f) => f());
    return;
  }
  if (
    p &&
    typeof p.at === "number" &&
    [
      "left",
      "right",
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
      "center",
      "elsewhere",
      "unobtrusive",
    ].includes(p.destination) &&
    Date.now() - p.at < 120000
  ) {
    task = p;
    listeners.forEach((f) => f());
  }
}
try {
  receive(JSON.parse(localStorage.getItem("mivuneko.behavior.v1") ?? "null"));
} catch {}
channel.onmessage = (e) => receive(e.data);
window.addEventListener("storage", (e) => {
  if (e.key === "mivuneko.behavior.v1")
    try {
      receive(JSON.parse(e.newValue ?? "null"));
    } catch {}
});
export function directCompanion(destination: Destination) {
  const value = { destination, at: Date.now() };
  receive(value);
  localStorage.setItem("mivuneko.behavior.v1", JSON.stringify(value));
  channel.postMessage(value);
}
export function useCompanionTask() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => task,
  );
}

export function cancelCompanionTask() {
  receive(null);
  localStorage.setItem("mivuneko.behavior.v1", "null");
  channel.postMessage(null);
}
