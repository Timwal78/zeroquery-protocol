/**
 * Pure-JS reference for the provenance scheme in provenance.circom.
 *
 * Computes the SAME Poseidon commitments/nullifiers the circuit constrains, so
 * an off-chain attestation produced here matches the circuit's public outputs
 * bit-for-bit. This lets the scheme be tested and used without the circom/snarkjs
 * proving toolchain installed (the on-chain SNARK proof is generated via
 * build.sh once that toolchain is available).
 */
import { buildPoseidon } from "circomlibjs";
import { createHash } from "node:crypto";

// BN254 scalar field prime (the field circom/snarkjs Groth16 operate in).
export const FIELD_PRIME =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let _poseidon = null;
async function poseidon() {
  if (!_poseidon) _poseidon = await buildPoseidon();
  return _poseidon;
}

/** Reduce arbitrary bytes to a field element (e.g. hash a raw API response). */
export function toField(bytes) {
  const h = createHash("sha256").update(bytes).digest("hex");
  return BigInt("0x" + h) % FIELD_PRIME;
}

/** commitment = Poseidon(apiResponseHash, timestamp, salt) — returns a decimal string. */
export async function commitment(apiResponseHash, timestamp, salt) {
  const p = await poseidon();
  return p.F.toString(p([BigInt(apiResponseHash), BigInt(timestamp), BigInt(salt)]));
}

/** nullifier = Poseidon(privateKey, intentHash) — returns a decimal string. */
export async function nullifier(privateKey, intentHash) {
  const p = await poseidon();
  return p.F.toString(p([BigInt(privateKey), BigInt(intentHash)]));
}

/** Build the full public attestation an agent posts alongside its ZK proof. */
export async function attest({ apiResponse, timestamp, salt, privateKey, intentHash }) {
  const apiResponseHash = toField(Buffer.from(apiResponse));
  return {
    timestamp: BigInt(timestamp).toString(),
    intentHash: BigInt(intentHash).toString(),
    commitment: await commitment(apiResponseHash, timestamp, salt),
    nullifier: await nullifier(privateKey, intentHash),
  };
}
