// Only reveal the top-level text field. Never interpret partial output as an action.
export function partialText(raw: string, requireChatRoute = false): string {
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "{" || raw[i] === "[") {
      depth++;
      continue;
    }
    if (raw[i] === "}" || raw[i] === "]") {
      depth--;
      continue;
    }
    if (raw[i] !== '"') continue;
    const start = i++;
    while (i < raw.length && raw[i] !== '"') {
      if (raw[i] === "\\") i++;
      i++;
    }
    if (i >= raw.length) return "";
    let key: unknown;
    try {
      key = JSON.parse(raw.slice(start, i + 1));
    } catch {
      return "";
    }
    if (depth !== 1 || key !== "text") continue;
    if (requireChatRoute) {
      // Text is speculative until both computer-routing fields rule out a handoff.
      // Text-first replies stay buffered; providers can stream chat by declaring
      // empty routing fields before text. Never render a task's discarded preamble.
      try {
        const prefix = raw
          .slice(0, start)
          .replace(/^```(?:json)?\s*/, "")
          .trim()
          .replace(/,$/, "");
        const route = JSON.parse(prefix + "}");
        if (route.computerTask !== "" || route.appQuery !== "") return "";
      } catch {
        return "";
      }
    }
    let j = i + 1;
    while (/\s/.test(raw[j] ?? "") && j < raw.length) j++;
    if (raw[j++] !== ":") continue;
    while (/\s/.test(raw[j] ?? "") && j < raw.length) j++;
    if (raw[j++] !== '"') return "";
    const valueStart = j;
    while (j < raw.length && raw[j] !== '"') {
      if (raw[j] === "\\") {
        if (j + 1 >= raw.length) break;
        j++;
      }
      j++;
    }
    let encoded = raw.slice(valueStart, j);
    for (let attempt = 0; attempt < 7; attempt++) {
      try {
        return JSON.parse('"' + encoded + '"');
      } catch {
        encoded = encoded.slice(0, -1);
      }
    }
    return "";
  }
  return "";
}
