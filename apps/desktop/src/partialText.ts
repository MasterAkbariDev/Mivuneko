// Only reveal the top-level text field. Never interpret partial output as an action.
export function partialText(raw: string): string {
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
