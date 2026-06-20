import { test } from "node:test";
import assert from "node:assert/strict";
import { commitment, nullifier, toField, attest, FIELD_PRIME } from "./reference.mjs";

const TS = 1_700_000_000;
const INTENT = toField(Buffer.from("intent-hash-bytes"));
const KEY = 12345678901234567890n;

test("toField reduces into the BN254 field", () => {
  const f = toField(Buffer.from("some api response body"));
  assert.ok(f >= 0n && f < FIELD_PRIME);
});

test("commitment is deterministic", async () => {
  const a = await commitment(111n, TS, 999n);
  const b = await commitment(111n, TS, 999n);
  assert.equal(a, b);
});

test("commitment hides the response: different salt -> different commitment", async () => {
  const a = await commitment(111n, TS, 1n);
  const b = await commitment(111n, TS, 2n);
  assert.notEqual(a, b);
});

test("commitment binds the timestamp", async () => {
  const a = await commitment(111n, TS, 5n);
  const b = await commitment(111n, TS + 1, 5n);
  assert.notEqual(a, b);
});

test("nullifier is deterministic per (key,intent) -> replay is detectable", async () => {
  const a = await nullifier(KEY, INTENT);
  const b = await nullifier(KEY, INTENT);
  assert.equal(a, b); // a verifier recording spent nullifiers blocks the reuse
});

test("nullifier binds identity and intent", async () => {
  const base = await nullifier(KEY, INTENT);
  assert.notEqual(base, await nullifier(KEY + 1n, INTENT)); // different key
  assert.notEqual(base, await nullifier(KEY, INTENT + 1n)); // different intent
});

test("attest() bundles the public signals an agent posts with its proof", async () => {
  const att = await attest({
    apiResponse: '{"price": 219.00}',
    timestamp: TS,
    salt: 424242n,
    privateKey: KEY,
    intentHash: INTENT,
  });
  assert.equal(att.timestamp, String(TS));
  assert.match(att.commitment, /^[0-9]+$/);
  assert.match(att.nullifier, /^[0-9]+$/);
  // reproducible
  const again = await attest({ apiResponse: '{"price": 219.00}', timestamp: TS, salt: 424242n, privateKey: KEY, intentHash: INTENT });
  assert.deepEqual(att, again);
});
