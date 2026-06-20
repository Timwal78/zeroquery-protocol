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
├── programs/
│   ├── poi-gossip/          # Anchor/Rust — L1 intent broadcast + Intent Dust event
│   ├── poi-escrow/          # Anchor/Rust — L3 non-custodial USDC intent bonds (x402)
│   └── poi-subscription/    # Anchor/Rust — SOL SaaS tier management (Scout/Runner/Relay/Builder)
├── hooks/xah-did/           # Xahau Hook (C → wasm32) — DID resolution + soulbound reputation
├── packages/
│   ├── sdk/                 # @zeroquery/sdk — DID, intent gossip, dust, resolver
│   └── relay/               # @zeroquery/relay — open-source gossip node
├── schema/                  # PoIIntent JSON-LD schema + example
├── examples/                # end-to-end Phase 1 walkthrough
├── docs/                    # Phase 1, architecture, compliance, deploy
├── .github/workflows/ci.yml # build + test SDK/relay, hook wasm, cargo check
├── Cargo.toml               # Rust workspace
├── Anchor.toml              # Anchor config
├── pnpm-workspace.yaml      # JS/TS workspace
└── LICENSE                  # Apache-2.0
```

---

## Phase 1 status

| Deliverable | State | Verified in-repo |
|-------------|-------|------------------|
| `@zeroquery/sdk` — DID, intent gossip, Intent Dust, IntentRank | ✅ working | 35 tests passing |
| `@zeroquery/relay` — open-source gossip node | ✅ working | 6 tests passing |
| Intent schema + canonical hashing + gossip message | ✅ working | covered by SDK tests |
| `xah-did` Hook (DID → soulbound reputation) | ✅ compiles to wasm32 | `pnpm hook:build` |
| `poi-gossip` Anchor program (L1 broadcast) | ✅ compiles | `cargo check --workspace` |
| `poi-escrow` Anchor program (L3 x402 USDC bonds) | ✅ compiles | `cargo check --workspace` |
| `poi-subscription` Anchor program (SOL SaaS tiers) | ✅ compiles + unit-tested | `cargo test -p poi-subscription` |
| IntentRank matching (L2, Phase 2) | ✅ working | in the SDK suite |
| ZK provenance scheme (Phase 2) | ✅ JS-verified | `cd circuits && npm test` |
| ZK Groth16 circuit + setup | ⏳ needs circom/snarkjs | `circuits/build.sh` |
| End-to-end Phase 1 flow | ✅ runs | `pnpm example` |
| Live Xahau-testnet / devnet deploy | ⬜ needs creds | runbook in `docs/DEPLOY.md` |

Constraints → code in [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md); scope in
[`docs/PHASE1.md`](docs/PHASE1.md) and [`docs/PHASE2.md`](docs/PHASE2.md);
self-review in [`docs/AUDIT.md`](docs/AUDIT.md).

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
