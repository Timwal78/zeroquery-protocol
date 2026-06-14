# Contributing to ZeroQuery

Thanks for helping build open infrastructure for the agentic web.

## Ground rules

1. **Keep the namespace clean.** No proprietary engines, scoring matrices, brand
   codenames, or sequence/harmonic constants belong in this repo. It is the
   public, Apache-2.0 protocol — the commercial/hosted half lives elsewhere.
2. **Never commit secrets.** No seeds, keypairs, `.env`, or treasury keys. The
   zero-custody posture (`docs/COMPLIANCE.md`) depends on it.
3. **Don't weaken a non-negotiable.** Changes that touch custody, token-issuance,
   the central-registry stance, or coin-stack isolation must update
   `docs/COMPLIANCE.md` and explain the control in the PR.

## Dev setup

```bash
pnpm install
pnpm -r build        # build SDK + relay
pnpm -r test         # run all JS tests
pnpm hook:build      # compile the Xahau hook to wasm32 (needs clang + lld)
cargo check --workspace   # compile-check the Anchor programs
```

## Before opening a PR

- `pnpm -r test` and `cargo check --workspace` pass.
- New behavior has tests (`node:test`).
- Public API changes are reflected in the package README and `docs/`.
- Commits are scoped and descriptive.

## Code style

- TypeScript: strict mode, no runtime deps in the SDK (auditability).
- Rust: `overflow-checks` on; no `unwrap()` in instruction handlers — return a
  typed `#[error_code]` instead.
- C hook: match the SDK's key-derivation and record layout exactly; document any
  change in both places.
