import { useSyncExternalStore } from "react";
import { isNative } from "./broker";
let entries: string[] = [];
const listeners = new Set<() => void>();
const channel = new BroadcastChannel("mivuneko.activity");
function receive(value: unknown) {
  if (Array.isArray(value)) {
    entries = value
      .filter((x): x is string => typeof x === "string" && x.length <= 1000)
      .slice(0, 200);
    listeners.forEach((fn) => fn());
  }
}
channel.onmessage = (event) => {
  if (event.data?.kind === "request")
    channel.postMessage({ kind: "snapshot", entries });
  else if (event.data?.kind === "snapshot") receive(event.data.entries);
  else receive(event.data);
};
if (!isNative) channel.postMessage({ kind: "request" });
if (isNative)
  void import("@tauri-apps/api/event")
    .then(({ listen }) =>
      listen("activity-updated", (event) => receive(event.payload)),
    )
    .catch(() => {});
export function setActivity(value: string[]) {
  receive(value);
  if (isNative)
    void import("@tauri-apps/api/event")
      .then(({ emitTo }) =>
        emitTo(
          new URLSearchParams(location.search).get("view") === "chat"
            ? "pet"
            : "main",
          "activity-updated",
          entries,
        ),
      )
      .catch(() => {});
  else channel.postMessage(entries);
}
export function logActivity(text: string) {
  setActivity([`${new Date().toLocaleTimeString()} · ${text}`, ...entries]);
}
export function useActivity(): [string[], typeof setActivity] {
  return [
    useSyncExternalStore(
      (fn) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
      () => entries,
    ),
    setActivity,
  ];
}
