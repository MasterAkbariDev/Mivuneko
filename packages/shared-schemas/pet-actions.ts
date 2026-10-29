import type { CompanionAction } from "./companion-actions.ts";
import { illustratedExpressions } from "./pet-expressions.ts";
export function parseCompanionActions(value: unknown): CompanionAction[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8)
    throw Error("Invalid companion action plan");
  return value.map((item) => {
    if (!item || typeof item !== "object")
      throw Error("Invalid companion action");
    const a = item as Record<string, unknown>;
    if (
      a.kind === "move" &&
      (a.gait === "walk" || a.gait === "run") &&
      typeof a.destination === "string" &&
      /^(?:left|right|up|down|top-left|top-right|bottom-left|bottom-right|center|elsewhere|unobtrusive|monitor-(?:other|left|right|up|down|[1-9]\d*))$/.test(
        a.destination,
      )
    )
      return {
        kind: "move",
        gait: a.gait,
        destination: a.destination,
      } as CompanionAction;
    if (
      a.kind === "sit" ||
      a.kind === "stand" ||
      a.kind === "automatic" ||
      a.kind === "hide"
    )
      return { kind: a.kind };
    if (
      a.kind === "expression" &&
      typeof a.expression === "string" &&
      illustratedExpressions.includes(a.expression)
    )
      return {
        kind: "expression",
        expression: a.expression,
      } as CompanionAction;
    throw Error(
      "Unsupported companion action; no part of the plan was executed",
    );
  });
}
