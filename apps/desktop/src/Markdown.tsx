import { useState } from "react";
import {
  parseMarkdown,
  type Block,
  type Inline,
} from "../../../packages/shared-schemas/markdown.ts";

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((n, i) =>
        n.t === "code" ? (
          <code key={i}>{n.text}</code>
        ) : n.t === "bold" ? (
          <strong key={i}>{n.text}</strong>
        ) : n.t === "italic" ? (
          <em key={i}>{n.text}</em>
        ) : n.t === "link" ? (
          // Links are shown, never followed: replies are untrusted text.
          <span key={i} className="md-link" title={n.href}>
            {n.text}
          </span>
        ) : (
          <span key={i}>{n.text}</span>
        ),
      )}
    </>
  );
}
function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="md-code">
      <div className="md-code-bar">
        <span>{lang || "code"}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              .writeText(code)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              })
              .catch(() => {});
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "table":
      return (
        <div className="md-table-wrap">
          <table>
            <thead>
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i} scope="col">
                    <Inlines items={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>
                      <Inlines items={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      return <CodeBlock lang={block.lang} code={block.code} />;
    case "heading":
      return (
        <p
          role="heading"
          aria-level={block.level}
          className={`md-h md-h${Math.min(3, block.level)}`}
        >
          <Inlines items={block.inline} />
        </p>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag>
          {block.items.map((item, i) => (
            <li key={i}>
              <Inlines items={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote>
          <Inlines items={block.inline} />
        </blockquote>
      );
    case "rule":
      return <hr />;
    default:
      return (
        <p>
          <Inlines items={block.inline} />
        </p>
      );
  }
}
// Assistant replies: Markdown subset with code panels. No raw HTML is ever rendered.
export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      {parseMarkdown(text).map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}
