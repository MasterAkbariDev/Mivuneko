export interface WorkContext {
  goal: string;
  request: string;
  status: "idle" | "working" | "waiting" | "completed" | "stopped";
  workspace: string;
  windowId: string;
  windowTitle: string;
  question: string;
  facts: string[];
}
export function workContext(value?: Partial<WorkContext> | null): WorkContext {
  const text = (s: unknown, n: number) =>
    typeof s === "string" ? s.slice(0, n) : "";
  return {
    goal: text(value?.goal, 3000),
    request: text(value?.request, 3000),
    status: ["working", "waiting", "completed", "stopped"].includes(
      value?.status || "",
    )
      ? value!.status!
      : "idle",
    workspace: text(value?.workspace, 1000),
    windowId: text(value?.windowId, 100),
    windowTitle: text(value?.windowTitle, 300),
    question: text(value?.question, 1000),
    facts: Array.isArray(value?.facts)
      ? value!.facts
          .filter((s) => typeof s === "string")
          .slice(-6)
          .map((s) => s.slice(0, 1200))
      : [],
  };
}
export function updateWorkContext(
  previous: WorkContext,
  patch: Partial<WorkContext>,
): WorkContext {
  return workContext({ ...previous, ...patch });
}
