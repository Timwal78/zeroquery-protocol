import { test } from "node:test";
import assert from "node:assert/strict";
import { intentRank, rankServices } from "../dist/index.js";

const NOW = 1_700_000_000;
const did = (n) => `did:poi:xah:rHb9CJAWyB4rj91VRWn96DkukG4bwdtyT${n}`;

test("empty history scores zero (no division by zero)", () => {
  assert.equal(intentRank({ did: did("h"), fulfillments: [], failures: [] }, { now: NOW }), 0);
});

test("a recent well-proven fulfillment scores ~ value", () => {
  const s = intentRank(
    { did: did("h"), fulfillments: [{ value: 1000, proofQuality: 1, timestamp: NOW }], failures: [] },
    { now: NOW },
  );
  assert.ok(Math.abs(s - 1000) < 1e-6);
});

test("proof quality scales the contribution linearly", () => {
  const full = intentRank({ did: did("h"), fulfillments: [{ value: 1000, proofQuality: 1, timestamp: NOW }], failures: [] }, { now: NOW });
  const half = intentRank({ did: did("h"), fulfillments: [{ value: 1000, proofQuality: 0.5, timestamp: NOW }], failures: [] }, { now: NOW });
  assert.ok(Math.abs(half - full / 2) < 1e-6);
});

test("recency decay halves a one-half-life-old fulfillment", () => {
  const old = intentRank(
    { did: did("h"), fulfillments: [{ value: 800, proofQuality: 1, timestamp: NOW - 30 * 86400 }], failures: [] },
    { now: NOW, halfLifeDays: 30 },
  );
  assert.ok(Math.abs(old - 400) < 1e-6);
});

test("failures reduce the score via the smoothed denominator", () => {
  const clean = intentRank({ did: did("h"), fulfillments: [{ value: 1000, proofQuality: 1, timestamp: NOW }], failures: [] }, { now: NOW });
  const withFail = intentRank(
    { did: did("h"), fulfillments: [{ value: 1000, proofQuality: 1, timestamp: NOW }], failures: [{ severity: 1, timestamp: NOW }] },
    { now: NOW },
  );
  assert.ok(withFail < clean);
  assert.ok(Math.abs(withFail - 500) < 1e-6); // 1000 / (1 + 1)
});

test("rankServices orders by score desc, deterministic tie-break by DID", () => {
  const a = { did: did("a"), fulfillments: [{ value: 500, proofQuality: 1, timestamp: NOW }], failures: [] };
  const b = { did: did("b"), fulfillments: [{ value: 900, proofQuality: 1, timestamp: NOW }], failures: [] };
  const c = { did: did("c"), fulfillments: [{ value: 500, proofQuality: 1, timestamp: NOW }], failures: [] };
  const ranked = rankServices([a, b, c], { now: NOW });
  assert.equal(ranked[0].did, did("b")); // highest score
  assert.deepEqual([ranked[1].did, ranked[2].did], [did("a"), did("c")]); // tie -> DID order
});

test("invalid inputs are rejected", () => {
  assert.throws(() => intentRank({ did: did("h"), fulfillments: [{ value: 1, proofQuality: 2, timestamp: NOW }], failures: [] }, { now: NOW }));
  assert.throws(() => intentRank({ did: did("h"), fulfillments: [], failures: [{ severity: 0, timestamp: NOW }] }, { now: NOW }));
});
