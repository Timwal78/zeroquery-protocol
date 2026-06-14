/**
 * RelayNode — open-source gossip participant.  (spec §3.3, §4.1)
 *
 * Anyone can run this. It maintains a TTL-bounded view of live intents,
 * de-duplicates, and forwards new intents to peers. Transport is injected
 * (`Transport`) so the relay logic is testable without sockets and so operators
 * can bind it to HTTP, libp2p, or the hosted backbone without touching core.
 *
 * The protocol functions without the company's nodes (WordPress.org model):
 * this package has a single dependency — the protocol SDK — and no network or
 * proprietary code.
 */
import { isExpired, isValidDid, type GossipMessage } from "@zeroquery/sdk";

export interface Peer {
  id: string;
  send(msg: GossipMessage): Promise<void> | void;
}

export interface Transport {
  /** Register a handler for inbound gossip from the network. */
  onMessage(handler: (msg: GossipMessage, fromPeerId?: string) => void): void;
}

export interface RelayOptions {
  /** Max distinct live intents held at once (back-pressure). Default 100_000. */
  maxIntents?: number;
  /** Injectable clock (unix seconds) for deterministic tests. */
  now?: () => number;
}

interface Entry {
  msg: GossipMessage;
  receivedAt: number;
}

export class RelayNode {
  private readonly intents = new Map<string, Entry>();
  private readonly peers = new Map<string, Peer>();
  private readonly maxIntents: number;
  private readonly now: () => number;

  // Metrics (read-only view via stats()).
  private _received = 0;
  private _forwarded = 0;
  private _rejected = 0;
  private _deduped = 0;

  constructor(opts: RelayOptions = {}) {
    this.maxIntents = opts.maxIntents ?? 100_000;
    this.now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  }

  addPeer(peer: Peer): void {
    this.peers.set(peer.id, peer);
  }
  removePeer(id: string): void {
    this.peers.delete(id);
  }

  /** Bind a transport: inbound messages are ingested + relayed automatically. */
  attach(transport: Transport): void {
    transport.onMessage((msg, fromPeerId) => {
      void this.ingest(msg, fromPeerId);
    });
  }

  /**
   * Validate, store, and forward a gossip message.
   * Returns the set of peer ids it was forwarded to ([] if dropped/duplicate).
   */
  async ingest(msg: GossipMessage, fromPeerId?: string): Promise<string[]> {
    this._received++;
    const t = this.now();

    if (!this.isWellFormed(msg) || isExpired(msg, t)) {
      this._rejected++;
      return [];
    }
    if (this.intents.has(msg.intentHash)) {
      this._deduped++;
      return []; // already seen — gossip storms are bounded by dedupe
    }
    this.evictExpired(t);
    if (this.intents.size >= this.maxIntents) {
      this._rejected++;
      return [];
    }

    this.intents.set(msg.intentHash, { msg, receivedAt: t });

    const targets: string[] = [];
    for (const [id, peer] of this.peers) {
      if (id === fromPeerId) continue; // don't echo back to sender
      await peer.send(msg);
      targets.push(id);
      this._forwarded++;
    }
    return targets;
  }

  /** Live (non-expired) intents, newest first. */
  active(now = this.now()): GossipMessage[] {
    this.evictExpired(now);
    return [...this.intents.values()]
      .sort((a, b) => b.receivedAt - a.receivedAt)
      .map((e) => e.msg);
  }

  /** Live intents whose rail matches, useful for responder filtering. */
  byRail(rail: GossipMessage["paymentRail"], now = this.now()): GossipMessage[] {
    return this.active(now).filter((m) => m.paymentRail === rail);
  }

  /** Drop intents whose ttl has elapsed. Returns count evicted. */
  evictExpired(now = this.now()): number {
    let n = 0;
    for (const [hash, entry] of this.intents) {
      if (isExpired(entry.msg, now)) {
        this.intents.delete(hash);
        n++;
      }
    }
    return n;
  }

  stats() {
    return {
      live: this.intents.size,
      peers: this.peers.size,
      received: this._received,
      forwarded: this._forwarded,
      rejected: this._rejected,
      deduped: this._deduped,
    };
  }

  private isWellFormed(msg: GossipMessage): boolean {
    return (
      typeof msg?.intentHash === "string" &&
      /^[0-9a-f]{64}$/.test(msg.intentHash) &&
      isValidDid(msg.agentDid) &&
      Number.isInteger(msg.bondAmount) &&
      msg.bondAmount > 0 &&
      Number.isInteger(msg.timestamp) &&
      Number.isInteger(msg.ttl) &&
      msg.ttl > 0
    );
  }
}
