import test from "node:test";
import assert from "node:assert/strict";
import {
  speakable,
  speechChunks,
} from "../../packages/shared-schemas/speech.ts";
import {
  parseMarkdown,
  parseInline,
} from "../../packages/shared-schemas/markdown.ts";
import { parseAgentReply } from "../../packages/shared-schemas/agent.ts";
const closure = `Sure! A closure is a function that remembers its scope.

\`\`\`js
function counter() {
  let n = 0;
  return () => ++n;
}
\`\`\`

Each call to \`counter()\` gets its own **n**. See https://developer.mozilla.org/closures`;
test("closure narration keeps all prose before and after code", () => {
  const said = speakable({ text: closure, speech: "A short summary." });
  assert.ok(
    said.startsWith("Sure! A closure is a function that remembers its scope."),
  );
  assert.ok(said.includes("A code example is available in our conversation."));
  assert.ok(said.includes("Each call to counter() gets its own n."));
  assert.ok(!/function counter|```|https?:/.test(said));
});
test("full explanation replaces a provider's short speech summary", () => {
  const text = Array.from(
    { length: 80 },
    (_, i) => `Sentence number ${i} is here.`,
  ).join(" ");
  assert.equal(speakable({ text, speech: "Short summary." }), text);
  const chunks = speechChunks(text, 220);
  assert.equal(chunks.join(" "), text);
  assert.ok(chunks.every((s) => s.length <= 220));
});
test("markdown is narrated without visual directions", () => {
  assert.equal(
    speakable({ text: "# Plan\n- first thing\n- second thing" }),
    "Plan. first thing. second thing.",
  );
  assert.equal(
    speakable({
      text: "Read [the docs](https://x.dev/a) or https://x.dev/b today",
    }),
    "Read the docs or the link today.",
  );
  assert.ok(
    !speakable({
      text: "Here is the code below:\n```js\nlet x=1\n```\nAfter that, call it twice.",
    }).includes("below"),
  );
  assert.ok(
    speakable({ text: "```js\nx()\n```\nAfter that, call it twice." }).endsWith(
      "After that, call it twice.",
    ),
  );
  assert.equal(speakable({ text: "" }), "");
});
test("markdown parses fences, lists and inline styles without producing html", () => {
  const blocks = parseMarkdown(closure);
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["para", "code", "para"],
  );
  assert.equal(blocks[1].lang, "js");
  assert.ok(blocks[1].code.includes("return () => ++n;"));
  const inline = parseInline("a `b` **c** *d* [e](https://x)");
  assert.deepEqual(
    inline.map((n) => n.t),
    ["text", "code", "text", "bold", "text", "italic", "text", "link"],
  );
  assert.equal(
    parseMarkdown("<script>alert(1)</script>")[0].inline[0].text,
    "<script>alert(1)</script>",
  );
  assert.deepEqual(
    parseMarkdown("- a\n- b\n1. c").map((b) => b.type),
    ["list", "list"],
  );
  assert.equal(
    parseMarkdown("```py\nprint(1)")[0].code,
    "print(1)",
    "unterminated fence while streaming",
  );
});
test("agent replies carry an optional bounded speech field", () => {
  const ok = parseAgentReply(
    JSON.stringify({ text: "Hi", emotion: "happy", speech: "Hello there." }),
  );
  assert.equal(ok.speech, "Hello there.");
  assert.equal(
    parseAgentReply(JSON.stringify({ text: "Hi", emotion: "happy" })).speech,
    undefined,
  );
  assert.equal(
    parseAgentReply(JSON.stringify({ text: "Hi", speech: "a".repeat(301) }))
      .speech,
    undefined,
  );
});
