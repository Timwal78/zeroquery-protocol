# ZeroQuery — Proof-of-Intent (PoI) Protocol

> Agents don't search. They **declare**. The network competes.

Open infrastructure for AI-to-AI intent resolution with non-custodial payment
rails. **No token. No custody. No central registry.**

This is the **public protocol repository** (Apache-2.0). It contains only the
open, runnable-by-anyone parts of the system — the relayer, programs, hooks,
circuits (planned), SDK, and schemas. The hosted SaaS, billing, dashboard,
Rail Miles, and affiliate tracking live in a **separate private repository**
(NEXUS402). This mirrors the WordPress.org / WordPress.com split mandated by
the spec (§3.3): the protocol must function without the company's nodes.

> **Isolation rule:** no proprietary engines, scoring matrices, or sequence
> constants belong in this repo. Keep the namespace clean.

---

## Coin-stack isolation (spec §3.6)

| Coin  | Layer | Role |
|-------|-------|------|
| SOL   | Infrastructure | Gossip, micro-fees, broadcast anchoring. **Company revenue is SOL only.** |
| USDC  | Settlement | Primary intent bond + settlement (SPL on Solana). |
| XRP   | Settlement | Cross-chain rail / bridge liquidity. |
| RLUSD | Settlement | XRPL-native stable settlement. |
| XAH   | Identity | DID resolution + soulbound reputation hooks. |

The company **never holds, pools, or routes** USDC / XRP / RLUSD. The only
treasury is SOL SaaS revenue (§3.1).

---

## Repository layout

```
zeroquery-protocol/
├── programs/poi-gossip/     # Anchor/Rust — Layer 1 intent broadcast + Intent Dust event
├── hooks/xah-did/           # Xahau Hook (C → wasm32) — DID resolution + soulbound reputation
├── packages/sdk/            # @zeroquery/sdk — DID derivation/resolution, intent gossip
├── schema/                  # PoIIntent JSON-LD schema + example
├── docs/                    # Phase 1 spec, architecture
├── Cargo.toml               # Rust workspace
├── Anchor.toml              # Anchor config
├── pnpm-workspace.yaml      # JS/TS workspace
└── LICENSE                  # Apache-2.0
```

---

## Phase 1 status

| Deliverable | State | Verified in-repo |
|-------------|-------|------------------|
| `@zeroquery/sdk` DID resolution (`did:poi:<chain>:<addr>`) | ✅ working | `pnpm --filter @zeroquery/sdk test` — 20 passing |
| Intent schema + canonical hashing + gossip message | ✅ working | covered by SDK tests |
| `xah-did` Hook (DID → soulbound reputation) | ✅ compiles to wasm32 | `pnpm hook:build` |
| `poi-gossip` Anchor program | ✅ source complete | `anchor build` (needs Solana SBF toolchain) |
| ZK provenance circuits | ⬜ Phase 2 | — |
| x402 USDC escrow (SPL) | ⬜ Phase 1 remaining | — |

See [`docs/PHASE1.md`](docs/PHASE1.md) for the detailed scope and what's next.

---

## Quick start

```bash
# SDK — DID resolution + intent gossip (no external services needed)
pnpm install
pnpm --filter @zeroquery/sdk build
pnpm --filter @zeroquery/sdk test

# Xahau hook — compile to wasm32 (needs clang + wasm-ld / lld)
pnpm hook:build

# Solana gossip program — needs the Anchor + Solana SBF toolchain
anchor build
```

### Resolve a DID

```ts
import { resolveDid, XahauJsonRpcReader } from "@zeroquery/sdk";

const reader = new XahauJsonRpcReader("https://xahau.network");
const { didDocument, reputation } = await resolveDid(
  "did:poi:xah:rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
  reader,
);
console.log(reputation?.decayedScore);
```

---

## License

Apache-2.0. See [LICENSE](LICENSE).
