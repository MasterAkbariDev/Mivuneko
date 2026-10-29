import { desktopIntent, type DesktopIntent } from "./desktop-intent.ts";
export type CompanionAction = Extract<
  DesktopIntent,
  { kind: "move" | "sit" | "stand" | "automatic" | "expression" | "hide" }
>;
const allowed = (a: DesktopIntent | null): a is CompanionAction =>
  !!a &&
  ["move", "sit", "stand", "automatic", "expression", "hide"].includes(a.kind);
export function companionSequence(
  input: string,
): { actions: CompanionAction[]; error?: string } | null {
  const parts = input
    .split(
      /\s*(?:,?\s+and then\s+|,?\s+then\s+|;\s*|,?\s+after that\s+|\s+and\s+(?=(?:go|come|walk|run|move|sit|stand|resume|take a seat)\b))\s*/i,
    )
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2 || !allowed(desktopIntent(parts[0]))) return null;
  if (parts.length > 8)
    return {
      actions: [],
      error: "Please use up to eight companion actions in one request.",
    };
  const actions: CompanionAction[] = [];
  for (let i = 0; i < parts.length; i++) {
    const text = /^(?:up|down|left|right)(?:\s|$)/i.test(parts[i])
        ? `go ${parts[i]}`
        : parts[i],
      a = desktopIntent(text);
    if (!allowed(a))
      return {
        actions: [],
        error: `I could not understand step ${i + 1}. Chains support movement, sitting, standing and automatic behavior.`,
      };
    actions.push(a);
  }
  return { actions };
}
export function describeAction(a: CompanionAction): string {
  if (a.kind === "hide") return "step out of view";
  if (a.kind === "expression")
    return a.expression === "auto"
      ? "resume automatic expressions"
      : `show ${a.expression}`;
  if (a.kind === "sit") return "sit down";
  if (a.kind === "stand") return "stand up";
  if (a.kind === "automatic") return "resume automatic behavior";
  const d = a.destination;
  return d.startsWith("monitor-")
    ? `move to ${d === "monitor-other" ? "the other monitor" : d.slice(8).match(/^\d+$/) ? `monitor ${d.slice(8)}` : `the ${d.slice(8)} monitor`}`
    : `${a.gait} ${d === "center" ? "to the center" : d === "elsewhere" ? "to another spot" : d === "unobtrusive" ? "out of your way" : d.replaceAll("-", " ")}`;
}
export async function runCompanionSequence(
  actions: CompanionAction[],
  perform: (action: CompanionAction, index: number) => Promise<void>,
  signal: AbortSignal,
) {
  for (let i = 0; i < actions.length; i++) {
    signal.throwIfAborted();
    await perform(actions[i], i);
    signal.throwIfAborted();
  }
}
