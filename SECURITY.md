# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue for an
exploitable vulnerability. Use GitHub's "Report a vulnerability" (Security →
Advisories) on this repository. We aim to acknowledge within 72 hours.

## Scope

In scope:
- `programs/poi-gossip`, `programs/poi-escrow` (Anchor/Solana)
- `hooks/xah-did` (Xahau Hook)
- `packages/sdk`, `packages/relay`

Particularly sensitive areas:
- **Fund-safety in `poi-escrow`** — any path that moves a bond without the coded
  `fulfill`/`expire`/`slash` conditions, or any way to set a vault authority to a
  key. By design there is no admin withdraw; report anything that contradicts
  that.
- **DID/reputation integrity** — key-derivation mismatches between the hook and
  SDK, or a way to write another account's reputation.
- **Relay DoS** — unbounded memory growth or dedupe bypass.

## Out of scope

- The hosted SaaS (separate private repo).
- Mainnet deployment before the audit items in `docs/COMPLIANCE.md` are closed.

## Pre-mainnet requirements

This code has **not** been audited. Do not deploy to mainnet with real funds
until the residual items in `docs/COMPLIANCE.md` (independent audit, ZK formal
verification, integration tests, legal review) are complete.
