import { useSyncExternalStore } from "react";
import {
  defaults,
  parsePreferences,
  type Preferences,
} from "../../../packages/shared-schemas/preferences.ts";
export { defaults, parsePreferences };
export type { Preferences };
let state = defaults;
try {
  state = parsePreferences(
    JSON.parse(localStorage.getItem("mivuneko.preferences.v1") ?? "null"),
  );
} catch {
  /* blocked or malformed storage: safe defaults */
}
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((fn) => fn());
}
window.addEventListener("storage", (e) => {
  if (e.key === "mivuneko.preferences.v1") {
    try {
      // A queued event may describe an older write from another app window.
      state = parsePreferences(
        JSON.parse(localStorage.getItem("mivuneko.preferences.v1") ?? "null"),
      );
      notify();
    } catch {}
  }
});
export function updatePreferences(patch: Partial<Preferences>) {
  try {
    state = parsePreferences(
      JSON.parse(localStorage.getItem("mivuneko.preferences.v1") ?? "null"),
    );
  } catch {}
  state = parsePreferences({ ...state, ...patch });
  try {
    localStorage.setItem("mivuneko.preferences.v1", JSON.stringify(state));
  } catch {}
  notify();
}
export function usePreferences() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => state,
  );
}
