export function tableCells(line: string): string[] {
  const source = line.trim().replace(/^\\\|/, "|");
  let code = false,
    cell = "";
  const cells: string[] = [];
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === "`" && source[i - 1] !== "\\") code = !code;
    if (c === "|" && !code && source[i - 1] !== "\\") {
      cells.push(cell.trim());
      cell = "";
    } else cell += c;
  }
  cells.push(cell.trim());
  if (cells[0] === "" && source.startsWith("|")) cells.shift();
  if (cells.at(-1) === "" && source.endsWith("|")) cells.pop();
  return cells.map((c) => c.replace(/\\\|/g, "|"));
}
export function tableSeparator(line: string) {
  const cells = tableCells(line);
  return (
    cells.length > 1 &&
    cells.every((c) => /^:?-{3,}:?$/.test(c.replace(/\s/g, "")))
  );
}
export function normalizeTables(source: string): string {
  let fenced = false;
  return source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) {
        fenced = !fenced;
        return line;
      }
      if (fenced || !line.includes("|") || !/[|]\s*:?-{3,}:?\s*[|]/.test(line))
        return line;
      let code = false,
        out = "";
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === "`" && line[i - 1] !== "\\") code = !code;
        if (c === "|" && !code) {
          let j = i + 1;
          while (/\s/.test(line[j] ?? "") && j < line.length) j++;
          if (j > i + 1 && line[j] === "|") {
            out += "|\n|";
            i = j;
            continue;
          }
        }
        out += c;
      }
      return out.replace(/^\\\|/, "|");
    })
    .join("\n");
}
export function narrateTables(source: string): string {
  const lines = normalizeTables(source).split("\n"),
    out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].includes("|") &&
      i + 1 < lines.length &&
      tableSeparator(lines[i + 1])
    ) {
      const headers = tableCells(lines[i]);
      i += 2;
      let row = 0;
      while (
        i < lines.length &&
        lines[i].trim() &&
        tableCells(lines[i]).length > 1
      ) {
        const cells = tableCells(lines[i]);
        const parts = headers.map((header, c) => {
          const value = (cells[c] ?? "").replace(
            /`([^`]+)`/g,
            (_, code: string) =>
              code.replace(/={1,3}/g, " equals ").replace(/→/g, " to "),
          );
          return `${header}: ${value}${/[.!?]$/.test(value) ? "" : "."}`;
        });
        out.push(`Row ${++row}. ${parts.join(" ")}`);
        i++;
      }
      i--;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join("\n");
}
