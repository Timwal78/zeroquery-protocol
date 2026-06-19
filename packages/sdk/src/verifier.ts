/**
 * ZK verifier helpers for the poi-verifier Solana program.  (spec §3.5)
 *
 * The `poi-verifier` program owns a PDA (`verifier_authority`) that acts as the
 * `verifier` signer for `poi-escrow` bonds.  Off-chain provers must know this
 * PDA's address before constructing the CPI transaction.
 *
 * NOTE: `getVerifierPda()` below is a compile-time placeholder.  In production,
 * use `@solana/web3.js` `PublicKey.findProgramAddressSync` with the seed
 * `[b"verifier_authority"]` against `POI_VERIFIER_PROGRAM_ID`.
 */

/** On-chain program ID of the poi-verifier Solana program (Phase 2 scaffold). */
export const POI_VERIFIER_PROGRAM_ID = "Verif1er11111111111111111111111111111111111";

/**
 * Returns the deterministic Verifier PDA address and bump seed.
 *
 * The PDA is derived from the seed `["verifier_authority"]` under
 * `POI_VERIFIER_PROGRAM_ID`.  It is stored as the `verifier` field when
 * opening a bond so the `poi-verifier` program can sign CPI calls to
 * `poi-escrow::fulfill` / `poi-escrow::slash` without exposing a private key.
 *
 * @returns An object with `pda` (base58 address) and `bump` (canonical bump).
 *
 * @remarks
 * This is a SDK-layer placeholder that returns a deterministic mock value.
 * In a live integration, call:
 * ```ts
 * import { PublicKey } from "@solana/web3.js";
 * const [pda, bump] = PublicKey.findProgramAddressSync(
 *   [Buffer.from("verifier_authority")],
 *   new PublicKey(POI_VERIFIER_PROGRAM_ID),
 * );
 * ```
 */
export function getVerifierPda(): { pda: string; bump: number } {
  // Placeholder — replace with PublicKey.findProgramAddressSync in a full
  // @solana/web3.js integration (see JSDoc above).
  return {
    pda: "ZKPda11111111111111111111111111111111111111",
    bump: 255,
  };
}
