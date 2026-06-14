import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INTENT_CONTEXT,
  canonicalize,
  hashIntent,
  buildGossipMessage,
  validateIntentPayload,
  isExpired,
} from "../dist/index.js";

const DID = "did:poi:xah:rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";

function validPayload(overrides = {}) {
  return {
    "@context": INTENT_CONTEXT,
    "@type": "PoIIntent",
    capability: "travel.hotel.search",
    params: { city: "LIS", checkIn: "2026-07-01", nights: 3 },
    maxBond: 500000,
    rail: "usdc-sol",
    ...overrides,
  };
}

test("canonicalize is key-order independent", () => {
  const a = canonicalize({ b: 1, a: { y: 2, x: 1 } });
  const z = canonicalize({ a: { x: 1, y: 2 }, b: 1 });
  assert.equal(a, z);
});

test("hashIntent is deterministic and order-independent", () => {
  const p1 = validPayload();
  const p2 = validPayload({ params: { nights: 3, checkIn: "2026-07-01", city: "LIS" } });
  assert.equal(hashIntent(p1), hashIntent(p2));
  assert.match(hashIntent(p1), /^[0-9a-f]{64}$/);
});

test("validateIntentPayload flags each bad field", () => {
  assert.deepEqual(validateIntentPayload(validPayload()), []);
  assert.ok(validateIntentPayload(validPayload({ rail: "doge" })).length === 1);
  assert.ok(validateIntentPayload(validPayload({ maxBond: -1 })).length === 1);
  assert.ok(validateIntentPayload(validPayload({ "@type": "X" })).length === 1);
});

test("buildGossipMessage assembles the wire message", () => {
  const msg = buildGossipMessage({
    payload: validPayload(),
    agentDid: DID,
    bondAmount: 100000,
    ttl: 60,
    now: 1_700_000_000,
  });
  assert.equal(msg.agentDid, DID);
  assert.equal(msg.bondAmount, 100000);
  assert.equal(msg.paymentRail, "usdc-sol");
  assert.equal(msg.timestamp, 1_700_000_000);
  assert.equal(msg.ttl, 60);
  assert.equal(msg.intentHash, hashIntent(validPayload()));
});

test("buildGossipMessage rejects over-bond and bad DID", () => {
  assert.throws(() =>
    buildGossipMessage({ payload: validPayload(), agentDid: DID, bondAmount: 999999999, ttl: 60 }),
  );
  assert.throws(() =>
    buildGossipMessage({ payload: validPayload(), agentDid: "did:poi:eth:x", bondAmount: 1, ttl: 60 }),
  );
});

test("isExpired respects ttl window", () => {
  const msg = buildGossipMessage({
    payload: validPayload(),
    agentDid: DID,
    bondAmount: 1,
    ttl: 60,
    now: 1000,
  });
  assert.ok(!isExpired(msg, 1059));
  assert.ok(isExpired(msg, 1060));
});
