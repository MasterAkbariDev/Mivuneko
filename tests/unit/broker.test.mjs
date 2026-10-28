import test from "node:test";
import assert from "node:assert/strict";
import { createMockBroker } from "../../packages/shared-schemas/mock-broker.ts";
test("approval is bound to one request and cannot replay", async () => {
  const b = createMockBroker();
  const p = await b.requestLaunch("telegram");
  const result = await b.resolveLaunch(p.id, true);
  assert.equal(result.ok, true);
  assert.match(result.message, /Mock launch/);
  await assert.rejects(b.resolveLaunch(p.id, true));
});
test("deny consumes approval and never reports success", async () => {
  const b = createMockBroker();
  const p = await b.requestLaunch("notepad");
  assert.equal((await b.resolveLaunch(p.id, false)).ok, false);
  await assert.rejects(b.resolveLaunch(p.id, true));
});
test("revoke invalidates pending actions", async () => {
  const b = createMockBroker();
  const p = await b.requestLaunch("telegram");
  await b.revoke();
  await assert.rejects(b.resolveLaunch(p.id, true));
});
test("unknown paths and executable names rejected", async () => {
  const b = createMockBroker();
  await assert.rejects(b.requestLaunch("C:\\Windows\\cmd.exe"));
  await assert.rejects(b.requestLaunch("cmd.exe"));
});

test("approval expires after sixty seconds and pending requests are bounded", async () => {
  let now = 0;
  const b = createMockBroker(() => now);
  const p = await b.requestLaunch("telegram");
  now = 60000;
  await assert.rejects(b.resolveLaunch(p.id, true));
  for (let i = 0; i < 8; i++) await b.requestLaunch("notepad");
  await assert.rejects(b.requestLaunch("notepad"));
  now += 60001;
  await assert.doesNotReject(b.requestLaunch("notepad"));
});
