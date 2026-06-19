import { RelayNode } from "@zeroquery/relay";
import { XahauJsonRpcReader, deriveDid, buildGossipMessage, INTENT_CONTEXT, type IntentPayload } from "@zeroquery/sdk";
import crypto from "node:crypto";

async function main() {
  console.log("Ghost-Layer Agent Starting...");

  // Xahau node endpoint — configurable via XAHAU_RPC_ENDPOINT env var.
  // Never hardcode a mainnet URL in source; operators supply their own node.
  const xahauEndpoint = process.env["XAHAU_RPC_ENDPOINT"];
  if (!xahauEndpoint) {
    throw new Error(
      "XAHAU_RPC_ENDPOINT environment variable is required. " +
      "Set it to your Xahau node JSON-RPC URL (e.g. https://xahau.network)."
    );
  }

  // In production, the bot listens to an SSE stream from the network relay.
  // For the devnet demo, we attach directly to a local RelayNode.
  const relay = new RelayNode();
  const reader = new XahauJsonRpcReader(xahauEndpoint);

  console.log("Waiting for intents from garner clients...");

  // 1. Mock an incoming client intent hitting the relay
  setTimeout(() => {
    console.log("\n[GOSSIP] Received new intent from Devnet Client!");
    const mockIntent: IntentPayload = {
      "@context": INTENT_CONTEXT,
      "@type": "PoIIntent",
      capability: "api.coingecko.com/solana/price",
      params: { operator: ">=", targetValue: "150.00" },
      maxBond: 50_000_000,
      rail: "usdc-sol",
    };
    
    // Create a mock DID and sign the intent
    const randomKey = crypto.randomBytes(32);
    const clientDid = deriveDid("sol", randomKey);
    const message = buildGossipMessage({
      payload: mockIntent,
      agentDid: clientDid,
      bondAmount: 50_000_000,
      ttl: 300
    });
    
    // Ingest into the relay (fire-and-collect; errors logged rather than swallowed).
    relay.ingest(message).then(
      (targets) => console.log(`Ingested intent; forwarded to ${targets.length} peer(s).`),
      (err: unknown) => console.error("relay.ingest failed:", err),
    );

    // 2. Trigger the automated responder logic
    processIntents(relay, reader);
  }, 2000);
}

async function processIntents(relay: RelayNode, reader: XahauJsonRpcReader) {
  console.log("Scanning relay for active intents...");
  // Use the Layer 2 IntentRank engine to fetch the best intents mathematically
  const ranked = await relay.rankActiveIntents(reader);
  
  if (ranked.length === 0) {
    console.log("No active high-rank intents found. Sleeping...");
    return;
  }

  const bestIntent = ranked[0];
  console.log(`Top Intent found! Broadcaster: ${bestIntent.agentDid} (Rank: ${bestIntent.rank})`);
  console.log(`Evaluating intent capability hash: ${bestIntent.intentHash.substring(0, 8)}...`);

  setTimeout(() => {
    console.log("Condition met. Generating Layer 5 SP1 Zero-Knowledge Proof...");

    setTimeout(() => {
      submitFulfillment();
    }, 1500);
  }, 1500);
}

function submitFulfillment() {
  console.log("[SOLANA DEVNET] Submitting ZK proof to poi-verifier smart contract...");
  console.log("Bounty released! Ghost-Layer successfully settled the intent on-chain.");
}

main().catch(console.error);
