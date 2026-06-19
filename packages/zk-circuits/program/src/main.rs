#![no_main]
sp1_zkvm::entrypoint!(main);

use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct GuestInput {
    intent_hash: [u8; 32],
    proof_hash: [u8; 32],
    oracle_pubkey: [u8; 32],
    signature: [u8; 64],
    payload: String,
}

#[derive(Deserialize)]
struct OraclePayload {
    status: String,
}

pub fn main() {
    // 1. Read input from the host prover
    let input = sp1_zkvm::io::read::<GuestInput>();

    // 2. Verify Oracle Signature (Ed25519)
    let vk = VerifyingKey::from_bytes(&input.oracle_pubkey).expect("Invalid pubkey bytes");
    let sig = Signature::from_bytes(&input.signature);
    
    // Panics if signature is invalid, safely failing the proof generation inside the VM
    vk.verify_strict(input.payload.as_bytes(), &sig).expect("Signature verification failed");

    // 3. Parse the JSON payload
    let parsed: OraclePayload = serde_json::from_str(&input.payload).expect("Invalid JSON payload");

    // 4. Determine settlement outcome (1 = fulfill, 3 = slash)
    let outcome: u8 = if parsed.status == "success" { 1 } else { 3 };

    // 5. Commit public values to the journal for the Solana poi-verifier
    // The Solana verifier contract expects: intent_hash, proof_hash, outcome
    sp1_zkvm::io::commit(&input.intent_hash);
    sp1_zkvm::io::commit(&input.proof_hash);
    sp1_zkvm::io::commit(&outcome);
}
