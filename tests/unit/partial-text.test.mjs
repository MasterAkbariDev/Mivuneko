import { test } from "node:test";
import { strict as assert } from "node:assert";
import { partialText } from "../../apps/desktop/src/partialText.ts";
test("stream preview exposes only the top-level text, including split escapes", () => {
  assert.equal(
    partialText('{"appQuery":"Chess","text":"Hello \\u263'),
    "Hello ",
  );
  assert.equal(
    partialText('{"appQuery":"Chess","text":"Hello \\u263a!'),
    "Hello ☺!",
  );
  assert.equal(partialText('{"other":{"text":"hidden"},"text":"safe'), "safe");
  assert.equal(partialText('{"appQuery":"Chess"'), "");
  assert.equal(partialText('{"text":"say \\"hi\\"'), 'say "hi"');
});
