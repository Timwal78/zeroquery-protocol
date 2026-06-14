# Phase 1 — Foundation

Scope (spec §9 Phase 1): Solana gossip prototype · DID resolution on XAH ·
intent schema (JSON-LD) · x402 USDC escrow (SPL).

This document tracks what is built, verified, and outstanding.

## 1. Gossip protocol (Solana / SOL) — `programs/poi-gossip`

Layer 1 intent broadcast. Status: **compiles** (`cargo check --workspace` → 0
errors). Full SBF build + `anchor test` need the Solana toolchain.

Implements:
- `initialize` / `set_params` — protocol config (admin, SOL treasury, fee).
- `broadcast_intent(intent_hash, agent_did, bond_amount, payment_rail, ttl)` —
  charges the **SOL micro-fee** (default 0.0001 SOL, §6.2), writes a TTL-bounded
  `IntentRecord`, and emits the **on-chain Intent Dust** event `PoIDust` (§5).
- `expire_intent` — reclaims rent once `ttl` elapses.

Zero-custody (§3.1): the program only moves SOL infra fees. `bond_amount` /
`payment_rail` are *referenced* metadata; the USDC bond is never held here.

The wire message fields match spec §4.1 exactly:
`intent_hash, agent_did, bond_amount, payment_rail, timestamp, ttl`.

**Outstanding:** local-validator integration tests (`anchor test`), throughput
work toward the 10k broadcasts/s target (off-chain gossip mesh — the on-chain
record is the anchor, not the hot path).

## 2. DID resolution on XAH — `hooks/xah-did` + `packages/sdk`

Status: **working & tested** off-ledger; hook **compiles to wasm32**.

- DID method `did:poi:xah:<addr>` derived deterministically from a public key
  (`@zeroquery/sdk`: `deriveDid`, `parseDid`, `isValidDid`).
- The `xah-did` Hook stores a 32-byte soulbound reputation record keyed by
  `SHA-512Half(DID)`; the SDK reads the same key via `XahauJsonRpcReader` and
  decodes it with time-decay (§3.2).
- Verified: `pnpm --filter @zeroquery/sdk test` → 20 passing, including the
  canonical XRPL keypair → address vector and the reputation decode/decay path.

**Outstanding:** live Xahau-testnet round-trip (`SetHook` install + `Invoke`
reputation events + JSON-RPC read). Needs a funded account/seed, which by the
zero-custody rule never lives in this repo.

## 3. Intent schema (JSON-LD) — `schema/`

Status: **done**. `intent.schema.json` (Draft 2020-12) + `intent.example.jsonld`.
Canonical hashing + validation implemented and tested in the SDK
(`canonicalize`, `hashIntent`, `validateIntentPayload`).

## 4. x402 USDC escrow (SPL) — `programs/poi-escrow`

Status: **compiles** (`cargo check --workspace`). Non-custodial bond mechanics
(spec §4.3, §3.1):

- `open_bond` — broadcaster deposits USDC into a vault owned by the `Bond` PDA
  (no human key). Records `verifier`, `responder`, `slash_sink`, `expiry`.
- `fulfill` — the bond's `verifier` attests a valid provenance proof → vault
  releases to the responder.
- `slash` — `verifier` attests a false fulfillment → vault routes to the
  `slash_sink` (burn/DAO).
- `expire` — permissionless crank after `expiry` → vault returns to broadcaster.

There is **no admin/withdraw instruction**: funds move only via these coded
outcomes. In Phase 2 the oracle `verifier` is replaced by the ZK verifier
program (spec §3.5) via CPI — still no human key.

**Outstanding:** `anchor test` against a local validator with an SPL mint;
optional reuse of the commercial `@relayos/mcp-paywall` x402 primitive for the
HTTP-402 handshake on the hosted side.

## 5. Open-source relay node — `packages/relay`

Status: **working & tested** (6 tests). `@zeroquery/relay` validates,
de-duplicates, TTL-expires, and forwards gossip messages with an injected
transport. Single dependency (the SDK); runs without the company's nodes (§3.3).

## 6. Intent Dust discovery — `packages/sdk/src/dust.ts`

Status: **working & tested**. Encode/decode capability signals for HTTP headers,
DNS TXT, email headers, and GitHub commit trailers (spec §5) — parasitic
discovery, no central registry.

## Toolchain notes

| Component | Build | Test |
|-----------|-------|------|
| SDK | `pnpm --filter @zeroquery/sdk build` | `... test` (node:test, 20 cases) |
| Hook | `pnpm hook:build` (clang→wasm32) | unit-tested via SDK record codec; on-ledger pending |
| Program | `anchor build` (Solana SBF) | `anchor test` pending |

## Decisions captured

- **npm scope:** public protocol packages publish under `@zeroquery/*`;
  `@relayos/*` is reserved for the commercial NEXUS402 packages. (Switchable —
  a find/replace across `package.json` files.)
- **Reputation key:** `SHA-512Half(DID)` (the primitive a Xahau hook can compute
  on-ledger), not SHA-256 — so SDK reads and hook writes use an identical key.
