use sp1_sdk::{ProverClient, SP1Stdin};
use serde::{Deserialize, Serialize};

/// The ELF (executable and linkable format) file for the Succinct RISC-V guest.
pub const POI_CIRCUIT_ELF: &[u8] = include_bytes!("../../program/elf/riscv32im-succinct-zkvm-elf");

#[derive(Serialize, Deserialize)]
struct GuestInput {
    intent_hash: [u8; 32],
    proof_hash: [u8; 32],
    oracle_pubkey: [u8; 32],
    signature: [u8; 64],
    payload: String,
}

#[tokio::main]
async fn main() {
    // Setup the SP1 prover client
    let client = ProverClient::new();
    let (pk, vk) = client.setup(POI_CIRCUIT_ELF);

    println!("Circuit Image ID: {}", vk.bytes32());

    // Mock input data for proof generation
    let input_data = GuestInput {
        intent_hash: [0u8; 32],
        proof_hash: [1u8; 32],
        oracle_pubkey: [2u8; 32],
        signature: [3u8; 64],
        payload: r#"{"status": "success"}"#.to_string(),
    };

    let mut stdin = SP1Stdin::new();
    stdin.write(&input_data);

    // Generate the Plonk SNARK Proof
    println!("Generating SNARK proof...");
    let proof = client
        .prove(&pk, stdin)
        .plonk()
        .run()
        .expect("failed to generate proof");

    println!("Successfully generated proof!");
    
    // Verify the proof natively as a sanity check before submitting to Solana
    client.verify(&proof, &vk).expect("failed to verify proof");
    
    // The `proof.bytes()` can now be submitted to the `poi-verifier` Solana program via the SDK!
}
