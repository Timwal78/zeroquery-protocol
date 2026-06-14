# Architecture

Five layers (spec §4), built bottom-up. Phase 1 lands Layers 1 and 4 plus the
intent schema; Layers 3 and 5 follow.

```
 ┌─────────────────────────────────────────────────────────────┐
 │ L5  ZK Provenance      prove (api_response, ts, key)         │  Phase 2
 ├─────────────────────────────────────────────────────────────┤
 │ L4  Identity & Reputation (XAH)   did:poi:xah  +  hooks      │  ✅ Phase 1
 │     hooks/xah-did   ·   @zeroquery/sdk resolver             │
 ├─────────────────────────────────────────────────────────────┤
 │ L3  Escrow & Settlement   x402 USDC(SPL) / RLUSD(XRPL)       │  Phase 1 (remaining)
 ├─────────────────────────────────────────────────────────────┤
 │ L2  Intent Matching   IntentRank (reputation-weighted)      │  Phase 2
 ├─────────────────────────────────────────────────────────────┤
 │ L1  Gossip (Solana)   broadcast_intent + PoIDust event      │  ✅ Phase 1
 │     programs/poi-gossip                                     │
 └─────────────────────────────────────────────────────────────┘
```

## Data flow: a broadcast → resolution round-trip

1. **Broadcaster agent** builds a `PoIIntent` (JSON-LD), hashes it
   (`hashIntent`), and assembles a gossip message (`buildGossipMessage`).
2. It calls `broadcast_intent` on `poi-gossip`: pays the SOL micro-fee, the
   program records the intent and emits `PoIDust` (on-chain Intent Dust).
3. **Responder agents** discover the intent (gossip mesh + Intent Dust channels,
   §5) and resolve the broadcaster's `did:poi:xah:...` via `resolveDid`, reading
   soulbound reputation from the `xah-did` hook state to weight trust.
4. Settlement happens off this layer via x402 escrow (L3); on success a
   reputation `F` event is submitted to the broadcaster/responder hook (L4),
   bumping `score`/`fulfilled`.

## Why two repos

The protocol (this repo, Apache-2.0) must run without the company (§3.3). The
hosted relay, billing, dashboard, Rail Miles, and affiliate tracking are the
commercial half and live privately in **NEXUS402**. `ghost-layer` is positioned
as the recommended **responder runtime** (ephemeral execution); it consumes this
protocol but is not part of it.

## Key derivation invariants

- Solana address = `base58(ed25519 pubkey)`.
- Xahau/XRPL address = `Base58Check(0x00 || RIPEMD160(SHA256(pubkey)))`.
- Reputation state key = `SHA-512Half(DID)` — computed identically in the C hook
  (`util_sha512h`) and the SDK (`createHash('sha512').subarray(0,32)`).
- Reputation record = 32 bytes BE: `score | fulfilled | failed | lastActive`.

If any of these drift between hook and SDK, resolution silently returns
`reputation: null`. They are asserted by the SDK test suite.
