export type Destination =
  | "up"
  | "down"
  | "monitor-other"
  | "monitor-left"
  | "monitor-right"
  | "monitor-up"
  | "monitor-down"
  | `monitor-${number}`
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
  | { kind: "locate" }
  | { kind: "hide" }
  | { kind: "expression"; expression: import("./preferences.ts").PetExpression }
  | { kind: "stand" }
  | { kind: "sit" }
  | { kind: "automatic" }
  | { kind: "screen" }
  | { kind: "open"; query: string };
export function desktopIntent(input: string): DesktopIntent | null {
  let text = input
    .trim()
    .replace(/^(?:(?:hey|hi)[, ]+(?:luna|haru|mivuneko)[, ]+)/i, "")
    .replace(/[.!?؟]+$/, "")
    .trim();
  // Polite wrappers stack ("can you please …", "… for me please"); strip them all.
  for (let previous = ""; previous !== text;) {
    previous = text;
    text = text
      .replace(
        /^(?:please|kindly|can you|could you|would you|will you|go ahead and|i(?:'d| would) like you to|i want you to)[, ]+/i,
        "",
      )
      .replace(/[, ]+(?:please|for me|now)$/i, "")
      .trim();
  }
  const persian = persianOpen(text);
  if (persian) return { kind: "open", query: persian };
  const emotion =
    /^(?:(?:show|look|act|be|feel|make (?:yourself|a))\s+)?(?:an?\s+)?(cry(?:ing)?|sleepy|sleeping|happy|sad|angry|surprised|shy|excited|confused|curious|thinking|love(?: me)?|loving|wink|proud|determined|dance|dancing|teasing|joking)(?:\s+(?:face|expression|mood|for me|please|now))?$/i.exec(
      text,
    );
  if (emotion) {
    const word = emotion[1].toLowerCase();
    const aliases: Record<string, string> = {
      cry: "crying",
      sleepy: "sleeping",
      curious: "thinking",
      "love me": "love",
      loving: "love",
      dance: "dancing",
    };
    return {
      kind: "expression",
      expression: (aliases[word] ??
        word) as import("./preferences.ts").PetExpression,
    };
  }
  if (
    /^(?:reset (?:your )?(?:expression|mood)|automatic (?:expressions|emotions)|express yourself naturally)$/i.test(
      text,
    )
  )
    return { kind: "expression", expression: "auto" };
  if (
    /\b(?:go|move|walk|step).*(?:outside|off) (?:of )?(?:my |the )?screen\b/i.test(
      text,
    )
  )
    return { kind: "hide" };
  if (
    /\b(?:interrupting|distracting|bothering|blocking) me\b|\b(?:go|move|walk).*(?:outside|off) (?:of )?(?:my |the )?(?:screen|workspace)\b/i.test(
      text,
    )
  )
    return { kind: "move", gait: "walk", destination: "unobtrusive" };
  if (
    /\b(?:out of (?:the |my )?(?:way|code|editor|screen|workspace)|in (?:the |my )way|(?:cannot|can.t) (?:code|work|see (?:the |my )?(?:stream|video|screen))|stop (?:blocking|covering)|not annoy|move aside|give me (?:some )?(?:space|room))\b/i.test(
      text,
    )
  )
    return { kind: "move", gait: "walk", destination: "unobtrusive" };
  if (
    /^(?:stand(?: up)?|get up|on your feet|wake(?: up)?|wake yourself up|rise and shine)(?: now)?$/i.test(
      text,
    )
  )
    return { kind: "stand" };
  if (/^(?:sleep|go to sleep|take a nap|go to bed)$/i.test(text))
    return { kind: "expression", expression: "sleeping" };
  if (
    /^(?:where (?:are you|did you go)|(?:i )?(?:can(?:not|'t) see you)|show yourself|come back)$/i.test(
      text,
    )
  )
    return { kind: "locate" };
  const open = /^(?:open|launch|start)(?:\s+up)?\s+(.{1,200})$/i.exec(text);
  if (open) {
    const query = open[1]
      .replace(/^(?:the|my)\s+/i, "")
      .replace(/\s+(?:app|application|program)$/i, "")
      .trim();
    if (query) return { kind: "open", query };
  }
  if (/^(?:sit(?: down| here| there)?|take a seat|settle down)$/i.test(text))
    return { kind: "sit" };
  if (
    /^(?:be automatic|resume(?: automatic behavior| free (?:walking|roaming))?|do your own thing|move freely|be free|you(?: are|'re) free|roam freely|free roam|walk freely)$/i.test(
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
    if (
      /\b(?:monitor|display|screen)\b/.test(rest) &&
      /\b(?:other|another|second|third|first|monitor \d|display \d|left|right|upper|lower|above|below)\b/.test(
        rest,
      )
    ) {
      const number =
        /\b(?:monitor|display|screen)\s*(\d+)\b/.exec(rest)?.[1] ??
        (/second/.test(rest)
          ? "2"
          : /third/.test(rest)
            ? "3"
            : /first/.test(rest)
              ? "1"
              : null);
      destination = number
        ? `monitor-${Number(number)}`
        : /left/.test(rest)
          ? "monitor-left"
          : /right/.test(rest)
            ? "monitor-right"
            : /upper|above/.test(rest)
              ? "monitor-up"
              : /lower|below/.test(rest)
                ? "monitor-down"
                : "monitor-other";
      return {
        kind: "move",
        gait: move[1].toLowerCase() === "run" ? "run" : "walk",
        destination,
      };
    }
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
    else if (/\b(?:up|above)\b/.test(rest)) destination = "up";
    else if (/\b(?:down|below)\b/.test(rest)) destination = "down";
    else if (/\b(?:center|centre|middle|here)\b/.test(rest))
      destination = "center";
    if (
      !rest ||
      /\b(?:to|in|up|down|over|here|there|left|right|place|spot|corner|center|centre|middle|elsewhere|around)\b/.test(
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
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/[^\p{L}\p{N}]/gu, "");
  const aliases: Record<string, string> = {
    chrome: "googlechrome",
    vscode: "visualstudiocode",
    code: "visualstudiocode",
    edge: "microsoftedge",
    telegramdesktop: "telegram",
    calc: "calculator",
    تلگرام: "telegram",
    ماشینحساب: "calculator",
    کروم: "googlechrome",
    سافاری: "safari",
    یادداشت: "notes",
    نوتپد: "notepad",
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

// "تلگرام رو باز کن", "لطفاً ماشین حساب را اجرا کن", "میشه تلگرام رو باز کنی؟", "باز کن تلگرام".
function persianOpen(text: string): string | null {
  const t = text.replace(/^(?:لطفا|لطفاً)\s+/, "").replace(/^میشه\s+/, "");
  const object =
    /^(.{1,100}?)\s+(?:رو|را)\s+(?:باز|اجرا)\s+(?:کن|کنی|بکن)$/.exec(t);
  const verb = /^(?:باز|اجرا)\s+کن\s+(.{1,100})$/.exec(t);
  return (object?.[1] ?? verb?.[1])?.trim() || null;
}
