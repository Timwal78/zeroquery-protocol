import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveDid,
  decodeReputation,
  repStateKey,
  REP_RECORD_BYTES,
  XahauJsonRpcReader,
} from "../dist/index.js";

const DID = "did:poi:xah:rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";

function u64be(n) {
  const b = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    b[i] = n & 0xff;
    n = Math.floor(n / 256);
  }
  return b;
}

function repRecord({ score, fulfilled, failed, lastActive }) {
  const out = new Uint8Array(REP_RECORD_BYTES);
  out.set(u64be(score), 0);
  out.set(u64be(fulfilled), 8);
  out.set(u64be(failed), 16);
  out.set(u64be(lastActive), 24);
  return out;
}

test("decodeReputation parses the 32-byte record", () => {
  const now = 1_700_000_000;
  const rec = repRecord({ score: 1000, fulfilled: 12, failed: 2, lastActive: now });
  const rep = decodeReputation(rec, now);
  assert.equal(rep.score, 1000);
  assert.equal(rep.fulfilled, 12);
  assert.equal(rep.failed, 2);
  assert.equal(rep.lastActive, now);
  assert.ok(Math.abs(rep.decayedScore - 1000) < 1e-6); // no elapsed time -> no decay
});

test("decay halves the score after one half-life of inactivity", () => {
  const last = 1_700_000_000;
  const rec = repRecord({ score: 800, fulfilled: 0, failed: 0, lastActive: last });
  const oneHalfLifeLater = last + 30 * 86400; // default 30-day half-life
  const rep = decodeReputation(rec, oneHalfLifeLater);
  assert.ok(Math.abs(rep.decayedScore - 400) < 1e-6);
});

test("resolveDid returns a W3C DID document + reputation from hook state", async () => {
  const now = 1_700_000_000;
  const rec = repRecord({ score: 500, fulfilled: 5, failed: 0, lastActive: now });
  const expectedKey = repStateKey(DID);

  const reader = {
    source: "mock",
    async getHookState(account, key) {
      assert.equal(account, "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh");
      assert.equal(Buffer.from(key).toString("hex"), Buffer.from(expectedKey).toString("hex"));
      return rec;
    },
  };

  const res = await resolveDid(DID, reader, now);
  assert.equal(res.didDocument.id, DID);
  assert.equal(res.didDocument.verificationMethod[0].blockchainAccountId,
    "xahau:rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh");
  assert.equal(res.reputation.score, 500);
  assert.equal(res.metadata.source, "mock");
});

test("resolveDid returns reputation:null when the account has no record", async () => {
  const reader = { source: "mock", async getHookState() { return null; } };
  const res = await resolveDid(DID, reader, 1_700_000_000);
  assert.equal(res.reputation, null);
  assert.equal(res.didDocument.service[0].type, "PoIReputation");
});

test("resolveDid without a reader resolves document-only", async () => {
  const res = await resolveDid("did:poi:sol:11111111111111111111111111111111");
  assert.equal(res.reputation, null);
  assert.equal(res.metadata.source, "did-only");
});

test("XahauJsonRpcReader validates the 32-byte namespace id", () => {
  assert.throws(() => new XahauJsonRpcReader("https://xahau-test.net", "zz"));
  const r = new XahauJsonRpcReader("https://xahau-test.net"); // default all-zero ns
  assert.match(r.source, /^xahau-jsonrpc:/);
});
