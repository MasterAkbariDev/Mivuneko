import test from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown } from "../../packages/shared-schemas/markdown.ts";
import { speakable } from "../../packages/shared-schemas/speech.ts";
const table = `| Type | What it stores | Quick example | Typical use |
|------|----------------|---------------|-------------|
| **int** | Whole numbers | \`count = 5\` | Loop counters |
| **float** | Decimal numbers | \`weight = 2.75\` | Measurements |
| **str** | Unicode text | \`greeting = "Hello, world!"\` | Display messages |
| **bool** | Truth values | \`is_ready = False\` | Conditions |
| **list** | Mutable collection | \`colors = ["red", "green"]\` | Growing sequences |
| **tuple** | Immutable collection | \`point = (3, 4)\` | Fixed records |
| **dict** | Key to value pairs | \`person = {"name": "Ada"}\` | Lookups |
| **set** | Unique items | \`ids = {1, 2, 3}\` | Removing duplicates |
| **NoneType** | No value | \`result = None\` | Default arguments |`;
test("tables render as headers and complete rows, including collapsed provider formatting", () => {
  for (const text of [table, table.replaceAll("\n", " ")]) {
    const blocks = parseMarkdown(text);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, "table");
    assert.equal(blocks[0].headers.length, 4);
    assert.equal(blocks[0].rows.length, 9);
    assert.equal(blocks[0].rows[2][2][0].t, "code");
  }
});
test("table narration reads every type, its column context and following prose", () => {
  const text = speakable({
    text: table + "\n\nThat is why choosing the right type matters.",
  });
  for (const t of [
    "int",
    "float",
    "str",
    "bool",
    "list",
    "tuple",
    "dict",
    "set",
    "NoneType",
  ])
    assert.ok(text.includes(`Type: ${t}.`), t);
  assert.ok(text.includes("Quick example: count equals 5."));
  assert.ok(text.endsWith("That is why choosing the right type matters."));
  assert.ok(!text.includes("---"));
  assert.ok(!text.includes("|"));
});
test("pipes in inline code do not split table cells", () => {
  const b = parseMarkdown(
    '| Name | Example |\n|---|---|\n| a | `x = "a|b"` |',
  )[0];
  assert.equal(b.type, "table");
  assert.equal(b.rows[0].length, 2);
  assert.equal(b.rows[0][1][0].text, 'x = "a|b"');
});
