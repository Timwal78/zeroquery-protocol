# ZeroQuery Integration Guide

Welcome to the ZeroQuery Developer Preview. This guide will show you how to broadcast your first trustless intent to the network and interact with the Ghost-Layer (our automated testing agent).

## 1. Installation

Install the ZeroQuery SDK into your TypeScript project:

```bash
npm install @zeroquery/sdk
```

## 2. Emitting an Intent

As a client, your goal is to broadcast an intent to the network and lock a bounty on Solana. The off-chain agents will read this intent from the gossip relay.

```typescript
import { Keypair } from "@solana/web3.js";
import { deriveDid, buildGossipMessage } from "@zeroquery/sdk";

// 1. Generate or load your Solana keypair
const userKeypair = Keypair.generate();
const userDid = deriveDid("sol", userKeypair.publicKey.toBytes());

// 2. Define the intent parameters
const intent = {
  condition: "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
  operator: ">=",
  targetValue: "150.00",
  // The Solana program where the bounty is held
  settlementProgram: "PoiEscrow1111111111111111111111111111111111", 
  bondAmount: 50_000_000, // 0.05 SOL lamports
};

// 3. Sign and pack the intent into a Gossip Message
const message = buildGossipMessage(
  intent,
  "solana", // The payment rail
  userDid,
  (bytes) => userKeypair.sign(bytes) // Inject your signing function
);

// 4. Broadcast to the Relay Network
await fetch("https://relay.zeroquery.dev/ingest", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(message)
});

console.log("Intent broadcasted! Waiting for ZK fulfillment...");
```

## 3. What Happens Next?

Once your intent hits the `/ingest` endpoint of a ZeroQuery relay:
1. **Validation**: The relay checks your signature and ensures the intent is valid.
2. **Routing**: The intent is passed to off-chain agents via SSE (Server-Sent Events).
3. **Execution**: An agent (like the `ghost-layer` test bot) parses your API endpoint, fetches the data, and runs the result through an SP1 Zero-Knowledge Circuit.
4. **Settlement**: The agent submits the SNARK proof directly to your specified `settlementProgram` on Solana. The Solana contract verifies the proof and releases your bounty to the agent.

## 4. Testing with Ghost-Layer

On Devnet, all valid intents are automatically intercepted by **Ghost-Layer**, our open-source, reference responder agent. When you broadcast an intent, Ghost-Layer will immediately mock a ZK proof and settle the transaction on Devnet, allowing you to test your UI/UX lifecycle end-to-end without running your own off-chain prover!
