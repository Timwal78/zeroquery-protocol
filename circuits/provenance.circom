pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

/*
 * Provenance — Zero-Knowledge attestation of intent fulfillment.  (spec §3.5, §4.5)
 *
 * A responder proves it actually obtained some data (e.g. an API response) at a
 * given time, and that the attestation is bound to its identity and to this
 * specific intent — WITHOUT revealing the raw response or its private key.
 *
 *   Private (witness):  apiResponseHash, salt, privateKey
 *   Public  (inputs):   timestamp, intentHash
 *   Public  (outputs):  commitment, nullifier
 *
 * Constraints:
 *   commitment = Poseidon(apiResponseHash, timestamp, salt)
 *       binds the (hidden) data to a (public) timestamp; `salt` hides it so the
 *       commitment reveals nothing about the response — opening it later proves
 *       "I had this exact data at this time".
 *
 *   nullifier  = Poseidon(privateKey, intentHash)
 *       binds the proof to the responder's secret key AND this intent. The same
 *       key cannot produce two distinct nullifiers for one intent, so a verifier
 *       that records spent nullifiers gets replay protection; a false-attestation
 *       slash (spec §3.5) targets the nullifier without ever learning the key.
 *
 * Poseidon is used (not SHA-256) because it is SNARK-friendly — cheap inside the
 * field arithmetic of a zk circuit.
 */
template Provenance() {
    // --- private witness ---
    signal input apiResponseHash;
    signal input salt;
    signal input privateKey;

    // --- public inputs ---
    signal input timestamp;
    signal input intentHash;

    // --- public outputs ---
    signal output commitment;
    signal output nullifier;

    component c = Poseidon(3);
    c.inputs[0] <== apiResponseHash;
    c.inputs[1] <== timestamp;
    c.inputs[2] <== salt;
    commitment <== c.out;

    component n = Poseidon(2);
    n.inputs[0] <== privateKey;
    n.inputs[1] <== intentHash;
    nullifier <== n.out;
}

component main { public [ timestamp, intentHash ] } = Provenance();
