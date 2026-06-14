# Phase 2 — Matching

Scope (spec §9 Phase 2): IntentRank algorithm · ZK proof circuit · reputation
hook on XAH · Intent Dust generators.

## 1. IntentRank — `packages/sdk/src/intentrank.ts`

Status: **working & tested** (7 tests). Reputation-weighted matching:

```
IntentRank(S) =  Σ (fulfillment_value · proof_quality · recency_decay)
                ----------------------------------------------------------
                 1 + Σ (failure_severity · recency_decay)
```

- `intentRank(history, opts)` — score one service; `rankServices(candidates)` —
  rank many, descending, with a deterministic DID tie-break so independent
  agents converge on the same winner.
- Recency decay shares the soulbound-reputation half-life model (spec §3.2).
- `proof_quality` is the hook where Phase 2's ZK provenance feeds in: a
  ZK-verified fulfillment carries quality 1, an unproven one trends to 0.

## 2. ZK provenance circuit — `circuits/`

Status: **scheme verified in JS; circuit + setup pending the proving toolchain.**

- `provenance.circom` — Groth16 circuit proving knowledge of
  `(apiResponseHash, salt, privateKey)` such that
  `commitment = Poseidon(apiResponseHash, timestamp, salt)` and
  `nullifier = Poseidon(privateKey, intentHash)` — without revealing the
  response or the key.
- `reference.mjs` / `reference.test.mjs` — a pure-JS implementation using the
  same Poseidon hash, **7 tests passing** (determinism, hiding, identity/intent
  binding, replay detectability). The off-chain attestation matches the
  circuit's public outputs exactly.
- `build.sh` — compile + trusted setup → proving/verification keys + an on-chain
  verifier. Requires `circom` + `snarkjs` (not bundled).

**Outstanding:** run `build.sh` on a machine with the toolchain; wire the
exported Groth16 verifier into `poi-escrow` as the `verifier` authority so
`fulfill`/`slash` gate on a valid proof + unspent nullifier (no human key).

## 3. Reputation hook on XAH

Delivered in Phase 1 (`hooks/xah-did`) — the soulbound reputation write side.
Phase 2 adds the link: a successful ZK-verified fulfillment drives the `F`
(fulfilled) reputation event; a slash drives `X`.

## 4. Intent Dust generators

The encode/decode primitives shipped in Phase 1 (`packages/sdk/src/dust.ts`).
Phase 2 turns them into active generators (HTTP middleware, DNS publisher,
GitHub trailer injector) — a remaining build item.

## Verification summary

| Component | Build | Test |
|-----------|-------|------|
| IntentRank | `pnpm --filter @zeroquery/sdk build` | 7 tests (in the 35-test SDK suite) |
| ZK reference | `cd circuits && npm install` | `npm test` — 7 tests |
| ZK circuit | `cd circuits && bash build.sh` | needs circom + snarkjs |
