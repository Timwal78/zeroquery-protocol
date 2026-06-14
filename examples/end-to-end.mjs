/**
 * End-to-end Phase 1 walkthrough (no external services).
 *
 *   1. Broadcaster builds + hashes an intent, makes a gossip message.
 *   2. Two relay nodes gossip it (dedupe + TTL + forwarding).
 *   3. A responder resolves the broadcaster DID + soulbound reputation
 *      (reputation served from a mock hook-state reader).
 *   4. Responder advertises its own capability via Intent Dust.
 *
 * Run:  node examples/end-to-end.mjs
 */
import {
  INTENT_CONTEXT,
  buildGossipMessage,
  resolveDid,
  repStateKey,
  encodeHttpHeader,
} from "@zeroquery/sdk";
import { RelayNode } from "@zeroquery/relay";

const BROADCASTER = "did:poi:xah:rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const now = 1_700_000_000;

// 1. Build + hash an intent, assemble the gossip message.
const gossip = buildGossipMessage({
  payload: {
    "@context": INTENT_CONTEXT,
    "@type": "PoIIntent",
    capability: "travel.hotel.search",
    params: { city: "LIS", checkIn: "2026-07-01", nights: 3 },
    maxBond: 500000,
    rail: "usdc-sol",
  },
  agentDid: BROADCASTER,
  bondAmount: 100000,
  ttl: 120,
  now,
});
console.log("1. intent_hash =", gossip.intentHash.slice(0, 16) + "…");

// 2. Gossip across two relays.
const relayA = new RelayNode({ now: () => now });
const relayB = new RelayNode({ now: () => now });
relayA.addPeer({ id: "B", send: (m) => relayB.ingest(m, "A") });
const forwarded = await relayA.ingest(gossip, "origin");
console.log("2. relayA forwarded to:", forwarded, "| relayB live:", relayB.active().length);

// 3. Responder resolves broadcaster DID + reputation (mock hook state).
const rec = new Uint8Array(32); // score=750, fulfilled=8, failed=1, lastActive=now
const put = (v, off) => { for (let i = 7; i >= 0; i--) { rec[off + i] = v & 0xff; v = Math.floor(v / 256); } };
put(750, 0); put(8, 8); put(1, 16); put(now, 24);
const reader = {
  source: "mock-hook",
  async getHookState(account, key) {
    return Buffer.from(key).equals(Buffer.from(repStateKey(BROADCASTER))) ? rec : null;
  },
};
const res = await resolveDid(BROADCASTER, reader, now);
console.log(
  "3. resolved:", res.didDocument.id.slice(0, 28) + "…",
  "| score:", res.reputation.score,
  "| decayed:", res.reputation.decayedScore.toFixed(1),
);

// 4. Responder advertises capability via Intent Dust (HTTP header).
const dust = encodeHttpHeader({
  did: "did:poi:sol:11111111111111111111111111111111",
  intents: ["travel", "booking"],
});
console.log(`4. dust header -> ${dust.name}: ${dust.value}`);

console.log("\n✅ Phase 1 end-to-end flow OK");
