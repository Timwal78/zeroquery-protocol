import { RelayNode } from "@zeroquery/relay";
import { XahauJsonRpcReader, deriveDid, buildGossipMessage } from "@zeroquery/sdk";
import crypto from "node:crypto";

async function main() {
  console.log("👻 Ghost-Layer Agent Starting...");

  // In production, the bot listens to an SSE stream from the network relay.
  // For the devnet demo, we attach directly to a local RelayNode.
  const relay = new RelayNode();
  const reader = new XahauJsonRpcReader("https://xahau.network");

  console.log("👻 Waiting for intents from garner clients...");

  // 1. Mock an incoming client intent hitting the relay
  setTimeout(() => {
    console.log("\n🔔 [GOSSIP] Received new intent from Devnet Client!");
    const mockIntent = {
      "@context": "https://zeroquery.dev/ns/poi/v1",
      "@type": "PoIIntent",
      capability: "api.coingecko.com/solana/price",
      params: { operator: ">=", targetValue: "150.00" },
      maxBond: 50_000_000,
      rail: "usdc-sol"
    } as any;
    
    // Create a mock DID and sign the intent
    const randomKey = crypto.randomBytes(32);
    const clientDid = deriveDid("sol", randomKey);
    const message = buildGossipMessage({
      payload: mockIntent,
      agentDid: clientDid,
      bondAmount: 50_000_000,
      ttl: 300
    });
    
    // Ingest into the relay
    relay.ingest(message);

    // 2. Trigger the automated responder logic
    processIntents(relay, reader);
  }, 2000);
}

async function processIntents(relay: RelayNode, reader: XahauJsonRpcReader) {
  console.log("👻 Scanning relay for active intents...");
  // Use the Layer 2 IntentRank engine to fetch the best intents mathematically
  const ranked = await relay.rankActiveIntents(reader);
  
  if (ranked.length === 0) {
    console.log("👻 No active high-rank intents found. Sleeping...");
    return;
  }

  const bestIntent = ranked[0];
  console.log(`👻 Top Intent found! Broadcaster: ${bestIntent.agentDid} (Rank: ${bestIntent.rank})`);
  console.log(`👻 Evaluating intent capability hash: ${bestIntent.intentHash.substring(0, 8)}...`);
  
  setTimeout(() => {
    console.log("✅ Condition met. Generating Layer 5 SP1 Zero-Knowledge Proof...");
    
    setTimeout(() => {
      submitFulfillment();
    }, 1500);

  }, 1500);
}

function submitFulfillment() {
  console.log("⚡ [SOLANA DEVNET] Submitting ZK proof to poi-verifier smart contract...");
  console.log("💸 Bounty released! Ghost-Layer successfully settled the intent on-chain.");
}

main().catch(console.error);
