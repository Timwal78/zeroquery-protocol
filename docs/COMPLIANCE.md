# Compliance & Control Mapping

> Built so a Fortune 500 compliance team can audit it (spec §11). Every control
> below maps a non-negotiable constraint to the exact place it is enforced. The
> thesis: **the company is a software vendor, not a financial institution** — it
> issues no security, holds no user funds, and runs no mandatory registry.

## 1. Zero custody (spec §3.1)

| Control | Enforcement | Location |
|---------|-------------|----------|
| Company never holds USDC/XRP/RLUSD | The escrow program has **no admin/withdraw instruction**. Funds leave the vault only via `fulfill` / `expire` / `slash`, each gated by coded rules. | `programs/poi-escrow/src/lib.rs` |
| Vault is not human-controlled | Vault token account authority is the `Bond` PDA (program-derived); no private key exists for it. | `OpenBond` accounts: `token::authority = bond` |
| Gossip layer touches only SOL infra fees | `broadcast_intent` transfers `broadcast_fee_lamports` to the treasury; the USDC bond is referenced (`bond_amount`, `payment_rail`) but never moved here. | `programs/poi-gossip/src/lib.rs` |
| No treasury keys in the repo | `.gitignore` blocks `.env`, `*.pem`, `id.json`, `*-keypair.json`, seeds. | `.gitignore` |

## 2. No token issuance / soulbound reputation (spec §3.2)

| Control | Enforcement | Location |
|---------|-------------|----------|
| No tradable/transferable token | Reputation is a counter in the account's own hook-state namespace; there is **no transfer/delegate/mint** operation. | `hooks/xah-did/did_hook.c` |
| Reputation decays to zero on inactivity | Exponential half-life decay computed at read time. | `packages/sdk/src/resolver.ts` `decodeReputation` |
| Reputation cannot be sold/rented | Bound to the DID's own account; resolution is deterministic from the key, not a registry entry that could be reassigned. | `did_hook.c`, `resolver.ts` |

## 3. Open-source relayer (spec §3.3)

| Control | Enforcement | Location |
|---------|-------------|----------|
| Anyone can run a node | `@zeroquery/relay` has a single dependency (the SDK), abstracts transport, and needs no company endpoint. | `packages/relay/` |
| Protocol functions without the company | Public repo is Apache-2.0; hosted SaaS lives in a separate private repo (NEXUS402). | `LICENSE`, `README.md` |

## 4. No central registry (spec §3.4)

| Control | Enforcement | Location |
|---------|-------------|----------|
| Discovery is parasitic, not directory-based | Intent Dust encode/decode for HTTP, DNS TXT, email, GitHub trailers — no lookup server. | `packages/sdk/src/dust.ts` |
| On-chain discovery is an emitted event, not a queryable company DB | `PoIDust` event emitted on broadcast; indexers consume it permissionlessly. | `poi-gossip` `emit!(PoIDust …)` |

## 5. ZK attestation / slashing (spec §3.5)

| Control | Enforcement | Location |
|---------|-------------|----------|
| Fulfillment requires attestation | `fulfill`/`slash` require the bond's recorded `verifier` to sign. Phase 1 = oracle key; Phase 2 = ZK verifier program via CPI (no human). | `poi-escrow` `Resolve` (`has_one = verifier`) |
| Slashing on false fulfillment | `slash` routes the bond to the configured `slash_sink` (burn/DAO), recorded at open. | `poi-escrow::slash` |

## 6. Coin-stack isolation (spec §3.6)

| Coin | Allowed use | Where bounded |
|------|-------------|---------------|
| SOL | infra fees only | `poi-gossip` fee transfer |
| USDC/RLUSD/XRP | settlement bond only, never company-held | `poi-escrow` rails enum; company has no key |
| XAH | identity + reputation only | `xah-did` hook |

## Separation of duties

- **Public protocol** (this repo): no proprietary engines, scoring matrices, or
  sequence constants. Clean Apache-2.0 namespace.
- **Private commercial** (NEXUS402): dashboard, SOL subscription billing, Rail
  Miles (database-only bookkeeping — not a token, spec §6.4), affiliate
  tracking, hosted relay config, treasury management.

## Residual items before a mainnet claim of completeness

These are **out of scope for a single build session** and must precede any
production/mainnet deployment (tracked, not done):

1. Independent smart-contract audit of `poi-gossip` + `poi-escrow`.
2. Formal verification of the ZK circuits (Phase 2, not yet written).
3. `anchor test` integration suite on a local validator.
4. Legal review confirming the no-security / no-custody posture per jurisdiction.
5. Live Xahau-testnet hook deployment + round-trip verification.
