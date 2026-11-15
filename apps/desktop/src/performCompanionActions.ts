import { packInfo } from "./characterPackStore";
import { wakeCompanion } from "../../../packages/shared-schemas/companion-wake";
import { parsePreferences } from "./preferences";
import {
  type CompanionAction,
  runCompanionSequence,
  describeAction,
} from "../../../packages/shared-schemas/companion-actions";
import { cancelCompanionTask, moveCompanion } from "./companionTask";
import { updatePreferences } from "./preferences";
import { publishPet } from "./session";
export async function performCompanionActions(
  actions: CompanionAction[],
  signal: AbortSignal,
) {
  const p = parsePreferences(
    JSON.parse(localStorage.getItem("mivuneko.preferences.v1") || "null"),
  );
  if (p.activePackId) {
    const pack = await packInfo(p.activePackId);
    if (!pack) throw Error("This character is no longer in the library.");
    if (pack.manifest.format !== "3d")
      for (const a of actions)
        if (
          a.kind === "expression" &&
          a.expression !== "auto" &&
          !pack.manifest.poses[a.expression]
        )
          throw Error(
            `This character does not include a ${a.expression} pose.`,
          );
  }
  if (
    p.renderer === "2d" &&
    actions.some(
      (a) =>
        a.kind === "expression" &&
        ["bored", "nervous", "relieved", "embarrassed"].includes(a.expression),
    )
  )
    throw Error("This expression is available for 3D characters.");
  await runCompanionSequence(
    actions,
    async (action, index) => {
      if (action.kind !== "expression" || action.expression !== "sleeping") {
        const current = parsePreferences(
          JSON.parse(localStorage.getItem("mivuneko.preferences.v1") || "null"),
        );
        updatePreferences(wakeCompanion(current));
      }
      publishPet(
        "happy",
        `Step ${index + 1} of ${actions.length}: ${describeAction(action)}.`,
      );
      if (action.kind === "gesture") {
        updatePreferences({ petGesture: { ...action, started: Date.now() } });
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, action.duration * 1000);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(signal.reason);
            },
            { once: true },
          );
        });
      } else if (action.kind === "lie") {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("recover_pet", { center: false });
        await moveCompanion(
          "seat",
          signal,
          () =>
            updatePreferences({
              petMode: "walk",
              petEdit: false,
              focus: false,
            }),
          "lie",
        );
        updatePreferences({ petMode: "lie" });
      } else if (action.kind === "move" || action.kind === "hide") {
        const destination =
          action.kind === "hide" ? "unobtrusive" : action.destination;
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("recover_pet", { center: false });
        signal.throwIfAborted();
        await moveCompanion(destination, signal, () =>
          updatePreferences({
            petMode: action.kind === "move" ? action.gait : "walk",
            petEdit: false,
            focus: false,
            monitor: "current",
            petAvoiding: destination === "unobtrusive",
          }),
        );
        if (action.kind === "hide") {
          signal.throwIfAborted();
          await invoke("hide_pet");
        }
      } else if (action.kind === "expression")
        updatePreferences({
          customPackPose: "",
          petExpression: action.expression,
          ...(action.expression === "sleeping"
            ? { petMode: "sleep" as const }
            : {}),
        });
      else {
        if (action.kind === "sit") {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("recover_pet", { center: false });
          await moveCompanion("seat", signal, () =>
            updatePreferences({
              petMode: "walk",
              petEdit: false,
              focus: false,
            }),
          );
        }
        if (action.kind !== "sit") cancelCompanionTask();
        updatePreferences({
          petMode:
            action.kind === "sit"
              ? "sit"
              : action.kind === "stand"
                ? "stand"
                : "auto",
        });
        await new Promise<void>((r) => setTimeout(r, 600));
      }
    },
    signal,
  );
}
