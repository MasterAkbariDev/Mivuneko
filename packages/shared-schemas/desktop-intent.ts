export type Destination =
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center"
  | "elsewhere"
  | "unobtrusive";
export type DesktopIntent =
  | { kind: "move"; gait: "walk" | "run"; destination: Destination }
  | { kind: "stand" }
  | { kind: "sit" }
  | { kind: "automatic" }
  | { kind: "screen" }
  | { kind: "open"; query: string };
export function desktopIntent(input: string): DesktopIntent | null {
  const text = input
    .trim()
    .replace(
      /^(?:(?:hey|hi)[, ]+(?:luna|haru|mivuneko)[, ]+)?(?:(?:please|can you|could you|would you)\s+)?/i,
      "",
    )
    .replace(/[.!?]+$/, "")
    .replace(/\s+please$/i, "")
    .trim();
  if (
    /\b(?:out of (?:the |my )?(?:way|code|editor|screen|workspace)|in (?:the |my )way|(?:cannot|can.t) (?:code|work)|stop (?:blocking|covering)|not annoy|move aside|give me (?:some )?(?:space|room))\b/i.test(
      text,
    )
  )
    return { kind: "move", gait: "walk", destination: "unobtrusive" };
  if (/^(?:stand(?: up)?|get up|on your feet)$/i.test(text))
    return { kind: "stand" };
  const open = /^(?:open|launch|start)\s+(.{1,200})$/i.exec(text);
  if (open)
    return { kind: "open", query: open[1].replace(/\s+please$/i, "").trim() };
  if (/^(?:sit(?: down| here| there)?|take a seat|settle down)$/i.test(text))
    return { kind: "sit" };
  if (
    /^(?:be automatic|resume(?: automatic behavior)?|do your own thing|move freely)$/i.test(
      text,
    )
  )
    return { kind: "automatic" };
  const move = /^(walk|run|move|come|go)\b(.*)$/i.exec(text);
  if (
    move &&
    !/\b(?:file|folder|program|script|command|code)\b/i.test(move[2])
  ) {
    const rest = move[2].toLowerCase();
    let destination: Destination = "elsewhere";
    if (/(?:top|upper).*left|left.*(?:top|upper)/.test(rest))
      destination = "top-left";
    else if (/(?:top|upper).*right|right.*(?:top|upper)/.test(rest))
      destination = "top-right";
    else if (/(?:bottom|lower).*left|left.*(?:bottom|lower)/.test(rest))
      destination = "bottom-left";
    else if (/(?:bottom|lower).*right|right.*(?:bottom|lower)/.test(rest))
      destination = "bottom-right";
    else if (/\bleft\b/.test(rest)) destination = "left";
    else if (/\bright\b/.test(rest)) destination = "right";
    else if (/\b(?:center|centre|middle|here)\b/.test(rest))
      destination = "center";
    if (
      !rest ||
      /\b(?:to|over|here|there|left|right|place|spot|corner|center|centre|middle|elsewhere|around)\b/.test(
        rest,
      )
    )
      return {
        kind: "move",
        gait: move[1].toLowerCase() === "run" ? "run" : "walk",
        destination,
      };
  }
  if (
    /\b(?:screen|display)\b/i.test(text) &&
    /^(?:what(?:'s| is)|help me|look|see|read|describe|explain|check|tell me)/i.test(
      text,
    )
  )
    return { kind: "screen" };
  return null;
}
export function matchApps<T extends { name: string }>(
  query: string,
  apps: T[],
): T[] {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/\.exe$/i, "")
      .replace(/[^\p{L}\p{N}]/gu, "");
  const aliases: Record<string, string> = {
    chrome: "googlechrome",
    vscode: "visualstudiocode",
    code: "visualstudiocode",
    edge: "microsoftedge",
    telegramdesktop: "telegram",
    calc: "calculator",
  };
  const q = normalize(query),
    key = aliases[q] ?? q;
  const exact = apps.filter((a) => {
    const n = normalize(a.name);
    return n === q || n === key;
  });
  if (exact.length) return exact;
  return key.length >= 3
    ? apps.filter((a) => normalize(a.name).includes(key))
    : [];
}
