#!/usr/bin/env bash
# Compile provenance.circom and run the Groth16 trusted setup.
#
# Requires (not bundled — install separately):
#   - circom  >= 2.1   https://docs.circom.io/getting-started/installation/
#   - snarkjs          npm i -g snarkjs
#   - circomlib        provided as a devDependency (the .circom sources)
set -euo pipefail
cd "$(dirname "$0")"

CIRCUIT=provenance
PTAU=pot12_final.ptau

command -v circom  >/dev/null || { echo "circom not installed: https://docs.circom.io/getting-started/installation/"; exit 1; }
command -v snarkjs >/dev/null || { echo "snarkjs not installed: npm i -g snarkjs"; exit 1; }
[ -d node_modules/circomlib ] || { echo "run 'pnpm install' (or npm install) here first for circomlib"; exit 1; }

# 1. Compile -> r1cs + wasm witness generator (circomlib on the include path).
circom "$CIRCUIT.circom" --r1cs --wasm --sym -l node_modules

# 2. Powers of Tau (universal phase-1). 2^12 constraints is ample for this circuit.
snarkjs powersoftau new bn128 12 pot12_0000.ptau -v
snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau --name="zeroquery" -e="$(head -c 32 /dev/urandom | xxd -p)"
snarkjs powersoftau prepare phase2 pot12_0001.ptau "$PTAU" -v

# 3. Groth16 setup -> proving + verification keys.
snarkjs groth16 setup "$CIRCUIT.r1cs" "$PTAU" "${CIRCUIT}_0000.zkey"
snarkjs zkey contribute "${CIRCUIT}_0000.zkey" "${CIRCUIT}_final.zkey" --name="zeroquery" -e="$(head -c 32 /dev/urandom | xxd -p)"
snarkjs zkey export verificationkey "${CIRCUIT}_final.zkey" verification_key.json

# 4. Export an on-chain verifier (Groth16). The Solidity verifier doubles as the
#    reference for the Solana verifier program integration.
snarkjs zkey export solidityverifier "${CIRCUIT}_final.zkey" verifier.sol

echo "OK -> ${CIRCUIT}.r1cs, ${CIRCUIT}_js/, ${CIRCUIT}_final.zkey, verification_key.json, verifier.sol"
