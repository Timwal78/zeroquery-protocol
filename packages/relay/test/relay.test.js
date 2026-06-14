import { test } from "node:test";
import assert from "node:assert/strict";
import { RelayNode } from "../dist/index.js";
import { buildGossipMessage, INTENT_CONTEXT } from "@zeroquery/sdk";

const DID = "did:poi:xah:rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";

function msg(capability, now, ttl = 60) {
  return buildGossipMessage({
    payload: {
      "@context": INTENT_CONTEXT,
      "@type": "PoIIntent",
      capability,
      params: { k: capability },
      maxBond: 1_000_000,
      rail: "usdc-sol",
    },
    agentDid: DID,
    bondAmount: 100,
    ttl,
    now,
  });
}

function collectingPeer(id, sink) {
  return { id, send: (m) => sink.push([id, m.intentHash]) };
}

test("ingest stores a valid intent and forwards to peers (not the sender)", async () => {
  const r = new RelayNode({ now: () => 1000 });
  const sink = [];
  r.addPeer(collectingPeer("A", sink));
  r.addPeer(collectingPeer("B", sink));

  const targets = await r.ingest(msg("travel", 1000), "A");
  assert.deepEqual(targets, ["B"]); // not echoed back to A
  assert.equal(r.active().length, 1);
  assert.equal(sink.length, 1);
});

test("duplicate intents are de-duplicated", async () => {
  const r = new RelayNode({ now: () => 1000 });
  const m = msg("travel", 1000);
  assert.deepEqual(await r.ingest(m), []);
  assert.deepEqual(await r.ingest(m), []); // forwarded:[] because duplicate
  assert.equal(r.stats().deduped, 1);
  assert.equal(r.active().length, 1);
});

test("expired intents are rejected on ingest and evicted from view", async () => {
  let t = 1000;
  const r = new RelayNode({ now: () => t });
  await r.ingest(msg("a", 1000, 60));
  assert.equal(r.active().length, 1);
  t = 1061; // past ttl
  assert.equal(r.active().length, 0);
  assert.equal(await r.ingest(msg("b", 900, 60)).then((x) => x.length), 0);
  assert.equal(r.stats().rejected, 1);
});

test("malformed messages are rejected", async () => {
  const r = new RelayNode({ now: () => 1000 });
  assert.deepEqual(await r.ingest({ intentHash: "xyz", agentDid: DID, bondAmount: 1, paymentRail: "usdc-sol", timestamp: 1000, ttl: 60 }), []);
  assert.equal(r.stats().rejected, 1);
});

test("byRail filters live intents", async () => {
  const r = new RelayNode({ now: () => 1000 });
  await r.ingest(msg("a", 1000));
  assert.equal(r.byRail("usdc-sol").length, 1);
  assert.equal(r.byRail("xrp").length, 0);
});

test("attach() wires a transport's inbound messages into the relay", async () => {
  const r = new RelayNode({ now: () => 1000 });
  let handler;
  r.attach({ onMessage: (h) => (handler = h) });
  handler(msg("travel", 1000));
  await new Promise((res) => setImmediate(res));
  assert.equal(r.active().length, 1);
});
