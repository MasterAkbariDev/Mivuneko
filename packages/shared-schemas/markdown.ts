import {
  normalizeTables,
  tableCells,
  tableSeparator,
} from "./markdown-tables.ts";
// A small, safe Markdown subset for chat replies. It only produces data (no HTML),
// so the renderer can never inject markup; links stay plain text.
export type Inline =
  | { t: "text" | "bold" | "italic" | "code"; text: string }
  | { t: "link"; text: string; href: string };
export type Block =
  | { type: "code"; lang: string; code: string }
  | { type: "heading"; level: number; inline: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; inline: Inline[] }
  | { type: "para"; inline: Inline[] }
  | { type: "rule" }
  | { type: "table"; headers: Inline[][]; rows: Inline[][][] };
const TOKEN =
  /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_|\[[^\]\n]+\]\([^)\s]+\))/g;
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ t: "text", text: text.slice(last, at) });
    const raw = m[0];
    if (raw.startsWith("`")) out.push({ t: "code", text: raw.slice(1, -1) });
    else if (raw.startsWith("**") || raw.startsWith("__"))
      out.push({ t: "bold", text: raw.slice(2, -2) });
    else if (raw.startsWith("["))
      out.push({
        t: "link",
        text: raw.slice(1, raw.indexOf("](")),
        href: raw.slice(raw.indexOf("](") + 2, -1),
      });
    else out.push({ t: "italic", text: raw.slice(1, -1) });
    last = at + raw.length;
  }
  if (last < text.length) out.push({ t: "text", text: text.slice(last) });
  return out;
}
export function parseMarkdown(source: string): Block[] {
  const lines = normalizeTables(source.replace(/&#(?:x20|32);|&nbsp;/gi, " "))
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length)
      blocks.push({ type: "para", inline: parseInline(para.join(" ")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s{0,3}(```|~~~)\s*([\w+#.-]*)/.exec(line);
    if (fence) {
      flush();
      const code: string[] = [];
      for (
        i++;
        i < lines.length && !lines[i].trimStart().startsWith(fence[1]);
        i++
      )
        code.push(lines[i]);
      blocks.push({ type: "code", lang: fence[2], code: code.join("\n") });
      continue;
    }
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      tableSeparator(lines[i + 1])
    ) {
      flush();
      const headers = tableCells(line).map(parseInline),
        rows: Inline[][][] = [];
      i += 2;
      while (
        i < lines.length &&
        lines[i].trim() &&
        tableCells(lines[i]).length > 1
      ) {
        const cells = tableCells(lines[i]);
        rows.push(headers.map((_, c) => parseInline(cells[c] ?? "")));
        i++;
      }
      i--;
      blocks.push({ type: "table", headers, rows });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({
        type: "heading",
        level: heading[1].length,
        inline: parseInline(heading[2]),
      });
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      blocks.push({ type: "rule" });
      continue;
    }
    const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      flush();
      const ordered = /\d/.test(item[1]);
      const last = blocks.at(-1);
      if (last?.type === "list" && last.ordered === ordered)
        last.items.push(parseInline(item[2]));
      else
        blocks.push({ type: "list", ordered, items: [parseInline(item[2])] });
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flush();
      blocks.push({ type: "quote", inline: parseInline(quote[1]) });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}
