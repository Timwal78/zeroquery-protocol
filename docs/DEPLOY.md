# Deployment Runbook

Everything here is **non-custodial**: keys/seeds are supplied via environment at
deploy time and never committed. Do not run mainnet steps until the audit items
in `COMPLIANCE.md` are closed.

## A. Xahau DID hook (`hooks/xah-did`)

Prereqs: Node 18+, a funded **Xahau testnet** account.

```bash
# 1. Get a funded testnet account + seed
#    https://xahau-test.net  (or the XRPL Labs faucet)  -> save the seed

# 2. Compile against the production hooks toolchain
npm i -g @xahau/hooks-cli
cd hooks/xah-did
c2wasm-cli contracts build --headers .      # emits cleaned did_hook.wasm

# 3. Install the hook on the identity account (SetHook)
export XAHAU_TESTNET_SEED=s....             # NEVER commit this
export XAHAU_WSS=wss://xahau-test.net
node scripts/install-hook.mjs               # SetHook txn (to be added)

# 4. Submit a reputation event (Invoke with OP/DID/AMT params)
#    then read it back:
node -e 'import("@zeroquery/sdk").then(async ({resolveDid, XahauJsonRpcReader}) => {
  const r = new XahauJsonRpcReader("https://xahau-test.net");
  console.log((await resolveDid(process.env.DID, r)).reputation);
})'
```

The SDK's `XahauJsonRpcReader` already speaks the `ledger_entry { hook_state }`
JSON-RPC call, so step 4 verifies the write→read→decode round-trip end to end.

## B. Anchor programs (`poi-gossip`, `poi-escrow`)

Prereqs: Solana CLI + Anchor (`avm`), a devnet keypair.

```bash
solana-keygen new -o ~/.config/solana/id.json     # if needed
solana airdrop 2 --url devnet

anchor build
anchor keys sync          # writes real program IDs into lib.rs + Anchor.toml
anchor deploy --provider.cluster devnet

# integration tests against a local validator
anchor test
```

After `anchor keys sync`, replace the placeholder `declare_id!(...)` values with
the generated program IDs (the command does this automatically).

## C. Relay node (`@zeroquery/relay`)

```bash
pnpm --filter @zeroquery/relay build
# bind a transport (HTTP/libp2p) and run; see packages/relay/README.md
```

## Secrets checklist (all via env / secret manager, never in git)

| Secret | Used by |
|--------|---------|
| `XAHAU_TESTNET_SEED` | hook install + reputation Invoke |
| Solana deploy keypair (`id.json`) | `anchor deploy` |
| (Phase 1 escrow) `verifier` keypair | attesting fulfill/slash; later the ZK program |
