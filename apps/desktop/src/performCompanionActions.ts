import { packInfo } from "./characterPackStore";
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
  await runCompanionSequence(
    actions,
    async (action, index) => {
      publishPet(
        "happy",
        `Step ${index + 1} of ${actions.length}: ${describeAction(action)}.`,
      );
      if (action.kind === "move" || action.kind === "hide") {
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
        });
      else {
        cancelCompanionTask();
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
