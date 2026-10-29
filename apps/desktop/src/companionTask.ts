import { isNative } from "./broker";
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
    /^(?:left|right|up|down|top-left|top-right|bottom-left|bottom-right|center|elsewhere|unobtrusive|monitor-(?:other|left|right|up|down|[1-9]\d*))$/.test(
      p.destination,
    ) &&
    Date.now() - p.at < 120000
  ) {
    task = p;
    listeners.forEach((f) => f());
  }
}
channel.onmessage = (e) => receive(e.data);
window.addEventListener("storage", (e) => {
  if (e.key === "mivuneko.behavior.v1")
    try {
      receive(JSON.parse(e.newValue ?? "null"));
    } catch {}
});
export function directCompanion(destination: Destination) {
  const value = { destination, at: Math.max(Date.now(), (task?.at ?? 0) + 1) };
  receive(value);
  localStorage.setItem("mivuneko.behavior.v1", JSON.stringify(value));
  channel.postMessage(value);
  return value.at;
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
  const previous = task;
  receive(null);
  localStorage.setItem("mivuneko.behavior.v1", "null");
  channel.postMessage(null);
  if (previous && isNative)
    void import("@tauri-apps/api/event")
      .then(({ emitTo }) =>
        emitTo("main", "pet-move-result", {
          at: previous.at,
          state: "cancelled",
          message: "Movement stopped.",
        }),
      )
      .catch(() => {});
}

export async function moveCompanion(
  destination: Destination,
  signal: AbortSignal,
  onStart: () => void,
) {
  const { listen } = await import("@tauri-apps/api/event");
  signal.throwIfAborted();
  let at = 0,
    done: (() => void) | undefined,
    fail: ((e: Error) => void) | undefined;
  const completion = new Promise<void>((resolve, reject) => {
    done = resolve;
    fail = reject;
  });
  const off = await listen<{ at: number; state: string; message: string }>(
    "pet-move-result",
    (e) => {
      if (e.payload.at !== at) return;
      if (e.payload.state === "arrived") done?.();
      else if (e.payload.state === "cancelled")
        fail?.(new DOMException("Movement stopped", "AbortError"));
      else if (e.payload.state === "failed")
        fail?.(new Error(e.payload.message));
    },
  );
  const abort = () =>
    fail?.(new DOMException("Action chain stopped", "AbortError"));
  const timer = setTimeout(
    () =>
      fail?.(
        new Error(
          "Movement did not finish in time. The remaining actions were cancelled.",
        ),
      ),
    120000,
  );
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    at = directCompanion(destination);
    onStart();
    await completion;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    off();
  }
}
