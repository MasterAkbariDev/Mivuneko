import test from "node:test";
import assert from "node:assert/strict";
import { pronounce } from "../../packages/shared-schemas/pronounce.ts";
test("OK and friends are spoken as words, not spelled out", () => {
  assert.equal(
    pronounce("OK, ok, Ok and O.K. all work"),
    "okay, okay, okay and okay all work",
  );
  assert.equal(pronounce("Thx, pls btw"), "thanks, please by the way");
});
test("names and abbreviations get a spoken form", () => {
  assert.equal(
    pronounce("I'm Luna from Mivuneko"),
    "I'm Luna from Mee voo neh ko",
  );
  assert.equal(
    pronounce("Use JS vs TS in the API"),
    "Use JavaScript versus TypeScript in the A P I",
  );
  assert.equal(pronounce("Use it e.g. today"), "Use it for example, today");
});
test("symbols and emoji are handled", () => {
  assert.equal(
    pronounce("Salt & pepper 50% done 😀🎉"),
    "Salt and pepper 50 percent done",
  );
  assert.equal(pronounce("yes/no"), "yes or no");
  assert.equal(pronounce("wait -- what"), "wait, what");
});
test("extra pronunciations can be supplied and are matched as whole words", () => {
  assert.equal(
    pronounce("Hi Kitsune and kitsunes", [["Kitsune", "Kit soo neh"]]),
    "Hi Kit soo neh and kitsunes",
  );
});
