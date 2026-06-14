# Self-Audit Log — Phase 1

A running record of the internal review performed while building Phase 1. This
is **not** a substitute for an independent third-party audit (see
`COMPLIANCE.md` residual items) — it documents what was checked, what was found,
and how it was resolved.

## Methodology

- Every Anchor program is compile-checked (`cargo check --workspace`).
- Every TS module has `node:test` coverage; the SDK has zero runtime deps.
- The Xahau hook is compiled to `wasm32` and its state layout/key derivation is
  asserted to match the SDK byte-for-byte.
- Fund-safety paths in `poi-escrow` were reviewed line-by-line for: missing
  authorization, double-spend, re-entrancy, griefing/DoS, and arithmetic safety.

## Findings

### F-1 · Escrow vault griefing → permanently locked funds · **Medium · FIXED**
`fulfill`/`slash`/`expire` transferred the recorded `bond.amount`, then closed
the vault. The vault is a public SPL account, so anyone could donate 1 token
unit into it; the residual balance would make `close_account` revert, locking
**every** resolution path and trapping the bond forever.
**Fix:** drain the vault's actual balance (`vault.amount`) on every payout/return,
guaranteeing a zero balance before close. `programs/poi-escrow/src/lib.rs`.

### F-2 · Resolver omitted hook `namespace_id` → live reads fail · **Medium · FIXED**
`XahauJsonRpcReader` built a `ledger_entry { hook_state }` request without
`namespace_id`, which Xahau requires for namespaced hook state. Live reputation
reads would have returned nothing.
**Fix:** `XahauJsonRpcReader` now takes a validated 32-byte `namespaceId`
(default all-zero) and includes it in the request. `packages/sdk/src/resolver.ts`.

### F-3 · SDK package missing its README · **Low · FIXED**
`packages/sdk/package.json` listed `README.md` in `files` but none existed —
`npm publish` would have shipped a broken package page. Added
`packages/sdk/README.md`.

## Reviewed — no change required

- **Escrow authorization.** `fulfill`/`slash` require the bond's recorded
  `verifier` to sign (`has_one = verifier`); `expire` is permissionless but can
  only send funds to the constrained `broadcaster_ata`. No theft vector.
- **Double-resolution.** After a terminal state the vault is closed and `state
  != Open`, so a second call fails account validation and the `NotOpen` guard.
- **Gossip fee path.** `broadcast_intent` validates `treasury == config.treasury`
  before the SOL transfer; the USDC bond is never touched on this layer.
- **Hook ↔ SDK parity.** Key = `SHA-512Half(DID)`; record = 32-byte BE
  `score|fulfilled|failed|lastActive`; `lastActive` stored as unix seconds on
  both sides. Asserted by `resolver.test.js`.
- **Relay back-pressure.** Inbound is validated, de-duplicated by `intentHash`,
  TTL-evicted, and bounded by `maxIntents`; sender is never echoed.

## Known limitations (documented, accepted for Phase 1)

- **Reputation magnitude.** `decodeReputation` reads `u64` fields into JS numbers;
  values above 2^53 lose precision. Reputation scores are small by construction;
  revisit with BigInt if score ceilings grow.
- **Bond account rent.** Terminal bonds keep their `Bond` record (≈0.002 SOL rent
  locked) as an on-chain audit trail; only the vault rent is reclaimed. Closing
  the record is a future option if rent reclamation is preferred over the trail.
- **Hook loop guards.** `did_hook.c` uses a small zeroing loop; the production
  `hook-cleaner` toolchain injects the required `_g()` guards at build.

## Not covered here (require external work before mainnet)

Independent contract audit · ZK circuit formal verification · on-validator
`anchor test` · legal/regulatory review · live testnet round-trip.
