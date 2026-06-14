# @zeroquery/sdk

Proof-of-Intent (PoI) protocol SDK. **Zero runtime dependencies** (auditability —
spec §8). DID derivation/resolution, intent gossip, and Intent Dust discovery.

```bash
npm install @zeroquery/sdk
```

## DID — `did:poi:<chain>:<address>`

```ts
import { deriveDid, parseDid, isValidDid } from "@zeroquery/sdk";

const did = deriveDid("xah", xahauPublicKeyBytes);  // did:poi:xah:r...
const { chain, address } = parseDid(did);
isValidDid("did:poi:sol:11111111111111111111111111111111"); // true
```

Supported chains: `sol`, `xah`, `xrp`, `base`. Solana addresses are
`base58(ed25519 pubkey)`; XRPL/Xahau are `Base58Check(0x00 || RIPEMD160(SHA256(pubkey)))`.

## Resolve a DID + soulbound reputation

```ts
import { resolveDid, XahauJsonRpcReader } from "@zeroquery/sdk";

const reader = new XahauJsonRpcReader("https://xahau-test.net");
const { didDocument, reputation } = await resolveDid("did:poi:xah:r...", reader);
// reputation.decayedScore applies time-decay (spec §3.2)
```

## Build + broadcast an intent

```ts
import { buildGossipMessage, INTENT_CONTEXT } from "@zeroquery/sdk";

const msg = buildGossipMessage({
  payload: { "@context": INTENT_CONTEXT, "@type": "PoIIntent",
    capability: "travel.hotel.search", params: { city: "LIS" },
    maxBond: 500000, rail: "usdc-sol" },
  agentDid: "did:poi:xah:r...",
  bondAmount: 100000,
  ttl: 120,
});
// msg = { intentHash, agentDid, bondAmount, paymentRail, timestamp, ttl }
```

## Intent Dust (parasitic discovery — spec §5)

```ts
import { encodeHttpHeader, parseHttpHeader, scanCommitMessage } from "@zeroquery/sdk";

const { name, value } = encodeHttpHeader({ did: "did:poi:xah:r...", intents: ["travel"] });
// X-PoI-Available: true;did=...;intents=travel
```

Also: `encodeDnsTxt`, `encodeEmailHeader`, `encodeGitHubTrailer` (+ matching parsers).

## Build & test

```bash
pnpm --filter @zeroquery/sdk build
pnpm --filter @zeroquery/sdk test   # 27 node:test cases
```

Apache-2.0.
