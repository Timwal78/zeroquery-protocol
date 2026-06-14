# @zeroquery/relay

Open-source Proof-of-Intent gossip node. Anyone can run it; the protocol does
not depend on the company's relays (spec §3.3). Single dependency: the protocol
SDK. No custody, no token, no network code baked in — **transport is injected**.

```ts
import { RelayNode } from "@zeroquery/relay";

const relay = new RelayNode({ maxIntents: 100_000 });

// Peers are anything with an id + send(msg). Bind your own transport
// (HTTP, libp2p, WebSocket, the hosted backbone) by implementing Transport.
relay.addPeer({ id: "peer-1", send: (msg) => myTransport.send("peer-1", msg) });
relay.attach({ onMessage: (h) => myTransport.onInbound(h) });

// Inbound intents are validated, de-duplicated, TTL-bounded, and forwarded.
const live = relay.active();      // current non-expired intents
const sol = relay.byRail("usdc-sol");
console.log(relay.stats());       // { live, peers, received, forwarded, ... }
```

## What it does

- **Validates** each gossip message (hash shape, DID, bond, ttl).
- **De-duplicates** by `intentHash` so gossip storms are bounded.
- **Expires** intents past their `ttl` (no unbounded growth).
- **Forwards** new intents to peers (never echoes back to the sender).
- **Reports** metrics via `stats()`.

## What it does not do

- It does not hold funds or keys.
- It does not rank/match (that's IntentRank, Layer 2, Phase 2).
- It does not bundle a transport — you bring HTTP/libp2p/etc.

## Build & test

```bash
pnpm --filter @zeroquery/relay build
pnpm --filter @zeroquery/relay test
```
