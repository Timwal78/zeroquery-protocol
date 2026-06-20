# @zeroquery/circuits — ZK provenance

Zero-Knowledge attestation that a responder actually obtained data at a given
time, bound to its identity and to a specific intent — without revealing the raw
data or its private key. (spec §3.5 ZK Attestation Mandate, §4.5 ZK Provenance.)

## The scheme

Witness (private): `apiResponseHash`, `salt`, `privateKey`
Public inputs: `timestamp`, `intentHash`
Public outputs: `commitment`, `nullifier`

```
commitment = Poseidon(apiResponseHash, timestamp, salt)
nullifier  = Poseidon(privateKey, intentHash)
```

- **commitment** — binds hidden data to a public timestamp. `salt` makes it
  hiding; opening it later proves "I held this exact response at this time".
- **nullifier** — binds the proof to the responder's secret key and this intent.
  A verifier that records spent nullifiers gets replay protection, and a
  false-attestation **slash** (spec §3.5) targets the nullifier without ever
  learning the key.

Poseidon (not SHA-256) is used because it is SNARK-friendly.

## What's verifiable here vs. what needs the toolchain

- ✅ **`reference.mjs` + `reference.test.mjs`** — a pure-JS implementation using
  the *same* Poseidon hash the circuit constrains. Run `npm test` (or
  `pnpm test`) to verify determinism, hiding, identity/intent binding, and
  replay detectability. This is the off-chain attestation an agent posts with
  its proof; its public signals match the circuit's outputs exactly.
- ⏳ **`provenance.circom` + `build.sh`** — the Groth16 circuit and trusted
  setup. Compiling/proving needs `circom` (Rust) + `snarkjs`, which are not
  bundled. `build.sh` produces `r1cs`, wasm witness gen, `*_final.zkey`,
  `verification_key.json`, and `verifier.sol`.

## Build (needs circom + snarkjs)

```bash
npm install            # circomlib (.circom sources) + circomlibjs (JS reference)
npm test               # verify the scheme in pure JS — no toolchain needed
bash build.sh          # compile + Groth16 setup -> proving/verification keys
```

## On-chain verification

The exported Groth16 verifier (`verifier.sol`) is the reference for the
on-chain check. In the protocol, the escrow program's `verifier` authority
(see `programs/poi-escrow`) is replaced by a Groth16 verifier that gates
`fulfill`/`slash` on a valid provenance proof + an unspent nullifier — closing
the loop with no human key in the path.
