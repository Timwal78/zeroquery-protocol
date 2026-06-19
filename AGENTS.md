# ZeroQuery Protocol — AI Agent Development Brief

ZeroQuery is an open, non-custodial AI-to-AI intent resolution protocol. Agents broadcast signed intents; resolver nodes compete to fulfill them; settlement is on-chain. This repo is the **public protocol** (Apache-2.0). The hosted SaaS, billing, and dashboard are in the private NEXUS402 repo.

## Architecture (Four Layers)

```
L1  poi-gossip (Anchor/Rust, Solana)
      Intent broadcast + Intent Dust micro-fee event
      programs/poi-gossip/src/lib.rs

L2  @zeroquery/relay (Node.js/TypeScript)
      Open-source gossip relay node — anyone can run one
      packages/relay/src/

L3  poi-escrow (Anchor/Rust, Solana)
      Non-custodial USDC intent bond + x402 settlement
      programs/poi-escrow/src/lib.rs

ID  xah-did Hook (C→wasm32, Xahau)
      DID resolution + soulbound reputation on XAH
      hooks/xah-did/did_hook.c
```

## Repository Layout

```
zeroquery-protocol/
├── programs/
│   ├── poi-gossip/         — Anchor: L1 intent broadcast
│   └── poi-escrow/         — Anchor: L3 non-custodial USDC bonds
├── packages/
│   ├── sdk/                — @zeroquery/sdk: DID, gossip, dust, resolver, verifier
│   ├── relay/              — @zeroquery/relay: open-source gossip node
│   └── ghost-layer/        — TypeScript ghost-layer integration (NOT the Python package)
├── hooks/xah-did/          — Xahau Hook: DID resolution + soulbound reputation
├── packages/zk-circuits/   — ZK provenance circuits (Phase 2, in progress)
├── schema/
│   ├── intent.schema.json  — Canonical PoIIntent JSON-LD schema
│   └── intent.example.jsonld
├── examples/end-to-end.mjs — Full Phase 1 walkthrough
├── docs/
│   ├── ARCHITECTURE.md
│   ├── PHASE1.md
│   ├── COMPLIANCE.md       — Constraints → code mapping
│   └── DEPLOY.md           — Devnet/testnet deploy runbook
├── mcp.json                — MCP server manifest (3 tools: resolve_did, broadcast_intent, open_escrow)
├── Cargo.toml              — Rust workspace
├── Anchor.toml             — Anchor config
└── pnpm-workspace.yaml     — pnpm JS/TS workspace
```

## Key Files

### `packages/sdk/src/index.ts`
Main SDK entry point. Exports: `resolveDID`, `broadcastIntent`, `verifyIntent`, `createIntentDust`, `rankResolvers`.

### `packages/sdk/src/intent.ts`
`PoIIntent` type + canonical hashing. Every intent must be hashed before signing.

### `packages/sdk/src/did.ts`
DID generation and resolution via Xahau. Format: `did:xah:<address>`

### `packages/sdk/src/verifier.ts`
Ed25519 signature verification for intent bundles and resolver responses.

### `programs/poi-gossip/src/lib.rs`
Anchor program: `broadcast_intent` instruction. Emits `IntentDust` event for micro-fee accounting.

### `programs/poi-escrow/src/lib.rs`
Anchor program: `open_escrow` + `settle_escrow` instructions. Non-custodial USDC bond — operator never holds funds.

### `mcp.json`
MCP server manifest. Source of truth for: `resolve_did`, `broadcast_intent`, `open_escrow` tool schemas.

## Coin Isolation Rule (spec §3.6)
**This is non-negotiable.** Never cross these lanes:
- SOL: gossip micro-fees + SaaS revenue ONLY
- USDC: intent bond + settlement (SPL, never pooled by operator)
- XRP/RLUSD: cross-chain bridge only
- XAH: DID identity only

**Never add code that routes USDC/XRP/RLUSD to an operator wallet.** All settlement is agent-to-agent via the poi-escrow program.

## Isolation Rule (spec §3.3)
This repo must function without the company's NEXUS402 nodes. Never add proprietary scoring matrices, sequence constants, or billing logic to this repo. Keep the namespace clean.

## Development

```bash
# Install all JS/TS packages
pnpm install

# Build and test the SDK
cd packages/sdk && pnpm build && pnpm test

# Run the relay node
cd packages/relay && pnpm start

# Check all Rust programs
cargo check --workspace

# Build the Xahau Hook (requires wasm32 toolchain)
cd hooks/xah-did && ./build.sh

# Run the end-to-end example
pnpm example
```

## Phase Status
- Phase 1 ✅: SDK, relay, gossip, escrow programs, Xahau hook — all working, 33 tests passing
- Phase 2 ⬜: ZK provenance circuits (`packages/zk-circuits/`) — in progress
- Live deploy ⬜: Needs Xahau testnet + Solana devnet credentials (see `docs/DEPLOY.md`)

## Hard Rules

- **No proprietary engines in this repo** — belongs in NEXUS402
- **No operator custody of settlement funds** — poi-escrow is non-custodial by design; never add an admin_withdraw instruction
- **Canonical intent hash before signing** — always use `hashIntent()` from the SDK before Ed25519 signing; raw JSON is not the canonical form
- **No hardcoded addresses** — all wallet/program addresses via env vars or Anchor.toml
- **MCP tool count** — `mcp.json` is the source of truth; update it when adding/renaming tools

## Built by ScriptMasterLabs (SDVOSB)
GitHub: https://github.com/Timwal78/zeroquery-protocol
Ecosystem: https://www.scriptmasterlabs.com
Contact: ScriptMasterLabs@gmail.com
