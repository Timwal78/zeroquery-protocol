# xah-did Hook

Xahau Hook implementing the **identity + reputation** layer (spec §4.4) for the
Proof-of-Intent protocol.

- **DID method:** `did:poi:xah:<classic-address>`
- **State key:** `SHA-512Half(DID)` — identical to `@zeroquery/sdk`'s
  `repStateKey`, so off-ledger reads line up with on-ledger writes.
- **Record:** 32 bytes, big-endian `score | fulfilled | failed | lastActive`.

## Soulbound by construction (spec §3.2)

Reputation is stored only in the **account's own** hook-state namespace. There
is no transfer, delegate, or mint operation — it cannot be sold, rented, or
moved. It is an experience counter, not a balance; the time-decay that drives
it to zero on inactivity is computed off-ledger by the SDK.

## Operations (`otxn_param`)

| Param | Bytes | Meaning |
|-------|-------|---------|
| `OP`  | 1 | `R` register, `F` fulfilled (+score, +1 fulfilled), `X` failed/slash (−score, +1 failed) |
| `DID` | ≤128 | the `did:poi:xah:r...` string |
| `AMT` | 8 | big-endian u64 score delta (required for `F`/`X`) |

## Build

```bash
./build.sh                 # emits did_hook.wasm (clang + wasm-ld)
```

`build.sh` is a **compile check** using stock clang. For production, build
against the upstream `xrpl-hooks` `hookapi.h` and run the **hook-cleaner** /
guard-injection toolchain — Xahau requires `_g()` guards around every loop, and
the canonical SDK header provides the full import surface. The local
`hookapi.h` here is a trimmed subset sufficient to compile this hook to wasm32.

## Deploy (production, not done in this repo)

1. Compile + clean with the xrpl-hooks toolchain.
2. `SetHook` transaction installing the wasm on the identity account, with the
   reputation namespace configured.
3. Reputation events are submitted as `Invoke` transactions carrying the
   `OP`/`DID`/`AMT` parameters above.

> Live install requires a funded Xahau account + seed; those never live in this
> repo (zero-custody, §3.1).
