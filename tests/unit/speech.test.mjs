import test from "node:test";
import assert from "node:assert/strict";
import { speakable } from "../../packages/shared-schemas/speech.ts";
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
test("a closure reply is spoken as a short sentence with no code", () => {
  const said = speakable({ text: closure });
  assert.ok(
    said.startsWith("Sure! A closure is a function that remembers its scope."),
  );
  assert.ok(said.endsWith("I put the code in the chat."));
  assert.ok(!/[`{}=>*]|https?:|function counter/.test(said), said);
  assert.ok(said.length < 300);
});
test("the model's speech field is preferred and bounded", () => {
  assert.equal(
    speakable({ text: closure, speech: "  Here is a closure example. " }),
    "Here is a closure example.",
  );
  assert.equal(speakable({ text: "x", speech: "a".repeat(400) }).length, 300);
});
test("urls, links, headings and list markers are stripped", () => {
  assert.equal(
    speakable({
      text: "Read [the docs](https://x.dev/a) or https://x.dev/b today",
    }),
    "Read the docs or the link today.",
  );
  assert.equal(
    speakable({ text: "# Plan\n- first thing\n- second thing" }),
    "Plan. first thing.",
  );
  assert.equal(
    speakable({ text: "```sh\nrm -rf x\n```" }),
    "I put the code in the chat.",
  );
  assert.equal(speakable({ text: "" }), "");
});
test("long replies are cut to about two sentences", () => {
  const long = Array.from(
    { length: 8 },
    (_, i) => `Sentence number ${i} is here.`,
  ).join(" ");
  assert.equal(
    speakable({ text: long }),
    "Sentence number 0 is here. Sentence number 1 is here.",
  );
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
